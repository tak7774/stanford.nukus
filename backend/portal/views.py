"""JSON API for the student / teacher portal. Everything lives under /api/portal/.

Rules that matter:
  * Every view sets its own permission_classes: the project default (IsStaffMember)
    is for admin.html and would lock portal people out.
  * A student only ever sees their own groups; a teacher only their own groups.
  * Teachers cannot log in until staff tick "approved" on their Profile.
"""
import re
from datetime import timedelta

from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import Count
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, BasePermission
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from core import telegram

from .models import Assignment, Book, Group, Lesson, Profile, Submission, new_username

PENDING_MESSAGE = "Заявка преподавателя ещё на рассмотрении. Мы позвоним вам, когда аккаунт будет готов."


def normalize_phone(value):
    """Digits only, always with the country code: '91 303 60 01' and '+998 91 303-60-01' are the same login.

    Returns None when it cannot be a phone number.
    """
    digits = re.sub(r"\D", "", str(value or ""))
    if len(digits) == 9:  # local Uzbek number without +998
        digits = "998" + digits
    return digits if 11 <= len(digits) <= 15 else None


def profile_of(user):
    if not user or not user.is_authenticated or not user.is_active:
        return None
    return getattr(user, "portal_profile", None)


class IsPortalStudent(BasePermission):
    message = "Нужно войти как студент."

    def has_permission(self, request, view):
        p = profile_of(request.user)
        return bool(p and p.role == "student")


class IsPortalTeacher(BasePermission):
    message = "Нужно войти как преподаватель."

    def has_permission(self, request, view):
        p = profile_of(request.user)
        return bool(p and p.role == "teacher" and p.approved)


class IsPortalMember(BasePermission):
    message = "Войдите в кабинет."

    def has_permission(self, request, view):
        p = profile_of(request.user)
        return bool(p and (p.role == "student" or p.approved))


def payload(user):
    p = profile_of(user)
    if not p or not (p.role == "student" or p.approved):
        return {"authenticated": False}
    return {"authenticated": True, "role": p.role, "full_name": p.full_name}


def errors_to_response(serializer):
    return Response({"errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


# ── Accounts ──────────────────────────────────────────────

class RegisterSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=["student", "teacher"])
    full_name = serializers.CharField(max_length=120)
    phone = serializers.CharField(max_length=30)
    password = serializers.CharField(max_length=128, write_only=True, trim_whitespace=False)
    note = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")

    def validate_full_name(self, v):
        v = " ".join(v.split())
        if len(v) < 3:
            raise serializers.ValidationError("Введите имя и фамилию")
        return v

    def validate_phone(self, v):
        digits = normalize_phone(v)
        if not digits:
            raise serializers.ValidationError("Введите телефон полностью, например +998 91 303 60 01")
        if Profile.objects.filter(phone=digits).exists():
            raise serializers.ValidationError("Этот телефон уже зарегистрирован")
        return digits

    def validate(self, data):
        try:
            validate_password(data["password"])
        except DjangoValidationError as e:
            raise serializers.ValidationError({"password": list(e.messages)})
        return data


@method_decorator(ensure_csrf_cookie, name="dispatch")
class MeView(APIView):
    """GET /api/portal/me/ — who is logged in (also sets the CSRF cookie portal.js needs)."""

    permission_classes = [AllowAny]

    def get(self, request):
        return Response(payload(request.user))


class RegisterView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "portal_register"

    def post(self, request):
        s = RegisterSerializer(data=request.data)
        if not s.is_valid():
            return errors_to_response(s)
        d = s.validated_data
        User = get_user_model()
        try:
            with transaction.atomic():
                # No email on the User row on purpose: see portal/models.py.
                user = User.objects.create_user(new_username(), "", d["password"])
                profile = Profile.objects.create(
                    user=user, role=d["role"], full_name=d["full_name"], phone=d["phone"],
                    note=d["note"], approved=d["role"] == "student",
                )
        except IntegrityError:  # two people registering the same phone at once
            return Response({"errors": {"phone": ["Этот телефон уже зарегистрирован"]}}, status=400)

        if profile.role == "teacher":
            telegram.send_after_commit(
                "Заявка преподавателя в кабинет\n"
                f"Имя: {profile.full_name}\nТелефон: {profile.phone}\nПредмет: {profile.note or '—'}\n"
                "Включить аккаунт: /api/django-admin/ → Profiles → галочка «approved»."
            )
            return Response({"pending": True, "detail": PENDING_MESSAGE}, status=status.HTTP_201_CREATED)
        login(request, user)
        return Response(payload(user), status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        phone = normalize_phone(request.data.get("phone", ""))
        password = str(request.data.get("password", ""))
        if not str(request.data.get("phone", "")).strip() or not password:
            return Response({"detail": "Введите телефон и пароль"}, status=400)
        profile = Profile.objects.select_related("user").filter(phone=phone).first() if phone else None
        user = authenticate(request, username=profile.user.username, password=password) if profile else None
        if user is None:
            return Response({"detail": "Неверный телефон или пароль"}, status=400)
        if profile.role == "teacher" and not profile.approved:
            return Response({"detail": PENDING_MESSAGE}, status=403)
        login(request, user)
        return Response(payload(user))


class LogoutView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        logout(request)
        return Response({"authenticated": False})


# ── Shared helpers ────────────────────────────────────────

def lesson_json(lesson):
    return {"group": lesson.group.title, "starts_at": lesson.starts_at, "ends_at": lesson.ends_at}


def next_lessons(groups):
    """Start time of the next upcoming lesson of each group, by group id."""
    result = {}
    for lesson in Lesson.objects.filter(group__in=groups, ends_at__gte=timezone.now()).order_by("starts_at"):
        result.setdefault(lesson.group_id, lesson.starts_at)
    return result


def book_json(book):
    return {"id": book.id, "title": book.title, "kind": book.kind, "group": book.group.title, "url": book.url}


def my_groups(profile):
    if profile.role == "teacher":
        return Group.objects.filter(teacher=profile, active=True)
    return Group.objects.filter(enrollments__student=profile, active=True)


# ── Student ───────────────────────────────────────────────

class StudentDashboard(APIView):
    permission_classes = [IsPortalStudent]

    def get(self, request):
        me = request.user.portal_profile
        groups = list(my_groups(me).select_related("teacher"))
        soon = next_lessons(groups)
        subs = {s.assignment_id: s for s in Submission.objects.filter(student=me, assignment__group__in=groups)}
        tasks = []
        for a in Assignment.objects.filter(group__in=groups).select_related("group"):
            s = subs.get(a.id)
            tasks.append({
                "id": a.id, "title": a.title, "instructions": a.instructions, "group": a.group.title,
                "due_date": a.due_date,
                "state": "todo" if s is None else s.status,
                "grade": s.grade if s else "", "feedback": s.feedback if s else "", "text": s.text if s else "",
            })
        # Open work first (soonest deadline on top), then waiting for review, then finished.
        rank = {"todo": 0, "submitted": 1, "reviewed": 2}
        tasks.sort(key=lambda t: (rank[t["state"]], t["due_date"]))
        now = timezone.now()
        week = Lesson.objects.filter(
            group__in=groups, ends_at__gte=now, starts_at__lte=now + timedelta(days=7)
        ).select_related("group")
        books = Book.objects.filter(group__in=groups).select_related("group")[:3]
        return Response({
            "full_name": me.full_name,
            "groups": [
                {"id": g.id, "title": g.title, "teacher": g.teacher.full_name if g.teacher else "",
                 "lessons_done": g.lessons_done, "lessons_total": g.lessons_total, "next_lesson": soon.get(g.id)}
                for g in groups
            ],
            "tasks": tasks,
            "week": [lesson_json(l) for l in week],
            "books": [book_json(b) for b in books],
        })


class SubmitSerializer(serializers.Serializer):
    text = serializers.CharField(max_length=10000)


class StudentSubmit(APIView):
    permission_classes = [IsPortalStudent]

    def post(self, request, pk):
        me = request.user.portal_profile
        assignment = get_object_or_404(Assignment, pk=pk, group__enrollments__student=me, group__active=True)
        s = SubmitSerializer(data=request.data)
        if not s.is_valid():
            return errors_to_response(s)
        sub = Submission.objects.filter(assignment=assignment, student=me).first()
        if sub and sub.status == "reviewed":
            return Response({"detail": "Работа уже проверена, изменить её нельзя."}, status=400)
        if sub:
            sub.text, sub.submitted_at = s.validated_data["text"], timezone.now()
            sub.save(update_fields=["text", "submitted_at"])
        else:
            Submission.objects.create(assignment=assignment, student=me, text=s.validated_data["text"])
        return Response({"state": "submitted"}, status=status.HTTP_201_CREATED)


# ── Teacher ───────────────────────────────────────────────

class TeacherDashboard(APIView):
    permission_classes = [IsPortalTeacher]

    def get(self, request):
        me = request.user.portal_profile
        groups = list(my_groups(me).annotate(students=Count("enrollments")))
        soon = next_lessons(groups)
        queue = (
            Submission.objects.filter(status="submitted", assignment__group__in=groups)
            .select_related("student", "assignment__group").order_by("submitted_at")
        )
        return Response({
            "full_name": me.full_name,
            "queue": [
                {"id": s.id, "student": s.student.full_name, "task": s.assignment.title,
                 "group": s.assignment.group.title, "submitted_at": s.submitted_at, "text": s.text,
                 "instructions": s.assignment.instructions}
                for s in queue
            ],
            "groups": [
                {"id": g.id, "title": g.title, "students": g.students, "next_lesson": soon.get(g.id)} for g in groups
            ],
        })


class TeacherGroupStudents(APIView):
    permission_classes = [IsPortalTeacher]

    def get(self, request, pk):
        group = get_object_or_404(Group, pk=pk, teacher=request.user.portal_profile)
        students = Profile.objects.filter(enrollments__group=group).order_by("full_name")
        return Response({"group": group.title, "students": [{"name": p.full_name, "phone": p.phone} for p in students]})


class AssignmentCreateSerializer(serializers.Serializer):
    group = serializers.IntegerField()
    title = serializers.CharField(max_length=160)
    instructions = serializers.CharField(max_length=5000, required=False, allow_blank=True, default="")
    due_date = serializers.DateField()


class TeacherAssignmentCreate(APIView):
    permission_classes = [IsPortalTeacher]

    def post(self, request):
        s = AssignmentCreateSerializer(data=request.data)
        if not s.is_valid():
            return errors_to_response(s)
        d = s.validated_data
        group = get_object_or_404(Group, pk=d["group"], teacher=request.user.portal_profile, active=True)
        a = Assignment.objects.create(group=group, title=d["title"].strip(), instructions=d["instructions"], due_date=d["due_date"])
        return Response({"id": a.id}, status=status.HTTP_201_CREATED)


class ReviewSerializer(serializers.Serializer):
    grade = serializers.CharField(max_length=20)
    feedback = serializers.CharField(max_length=5000, required=False, allow_blank=True, default="")


class TeacherReview(APIView):
    permission_classes = [IsPortalTeacher]

    def post(self, request, pk):
        sub = get_object_or_404(Submission, pk=pk, assignment__group__teacher=request.user.portal_profile)
        s = ReviewSerializer(data=request.data)
        if not s.is_valid():
            return errors_to_response(s)
        sub.grade, sub.feedback = s.validated_data["grade"].strip(), s.validated_data["feedback"]
        sub.status, sub.reviewed_at = "reviewed", timezone.now()
        sub.save(update_fields=["grade", "feedback", "status", "reviewed_at"])
        return Response({"state": "reviewed"})


# ── Library ───────────────────────────────────────────────

class BookCreateSerializer(serializers.Serializer):
    group = serializers.IntegerField()
    title = serializers.CharField(max_length=160)
    kind = serializers.ChoiceField(choices=["pdf", "audio", "link"])
    url = serializers.URLField(max_length=500)

    def validate_url(self, v):
        # Only normal web links: never javascript:, data:, file: ...
        if not v.lower().startswith(("http://", "https://")):
            raise serializers.ValidationError("Нужна ссылка, которая начинается с https://")
        return v


class Library(APIView):
    permission_classes = [IsPortalMember]

    def get(self, request):
        me = request.user.portal_profile
        groups = my_groups(me)
        books = Book.objects.filter(group__in=groups).select_related("group")
        return Response({
            "role": me.role,
            "groups": [{"id": g.id, "title": g.title} for g in groups],
            "books": [dict(book_json(b), mine=b.added_by_id == me.id) for b in books],
        })

    def post(self, request):
        me = request.user.portal_profile
        if me.role != "teacher" or not me.approved:
            return Response({"detail": "Добавлять книги могут только преподаватели."}, status=403)
        s = BookCreateSerializer(data=request.data)
        if not s.is_valid():
            return errors_to_response(s)
        d = s.validated_data
        group = get_object_or_404(Group, pk=d["group"], teacher=me, active=True)
        b = Book.objects.create(group=group, title=d["title"].strip(), kind=d["kind"], url=d["url"], added_by=me)
        return Response({"id": b.id}, status=status.HTTP_201_CREATED)


class LibraryBook(APIView):
    permission_classes = [IsPortalTeacher]

    def delete(self, request, pk):
        book = get_object_or_404(Book, pk=pk, group__teacher=request.user.portal_profile)
        book.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
