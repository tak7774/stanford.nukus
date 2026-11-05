import re
import uuid
from datetime import datetime, time, timedelta
from urllib.parse import urlparse

from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import BooleanField, Count, ExpressionWrapper, Max, Q
from django.db.models.functions import TruncDate
from django.shortcuts import get_object_or_404
from django.http import Http404, HttpResponse
from django.utils import timezone
from django.views.decorators.http import require_GET
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from portal.models import Profile, new_username
from portal.views import normalize_phone

from . import telegram
from .images import ImageError, process_upload
from .models import (
    ExamRegistration,
    MockExam,
    News,
    PageView,
    StudentResult,
    Teacher,
    TrialRegistration,
)
from .permissions import get_role
from .serializers import (
    DEFAULT_EXAM_PRICE_UZS,
    AdminExamRegistrationSerializer,
    AdminMockExamSerializer,
    AdminNewsSerializer,
    AdminStudentResultSerializer,
    AdminTeacherSerializer,
    AdminTrialRegistrationSerializer,
    MockResultLookupSerializer,
    PublicExamRegistrationSerializer,
    PublicNewsSerializer,
    PublicMockExamSerializer,
    PublicStudentResultSerializer,
    PublicTeacherSerializer,
    PublicTrialRegistrationSerializer,
)


def exams_with_counts():
    return MockExam.objects.annotate(registered=Count("registrations"))


# ════════════════════════════════════════════
# PUBLIC — used by index.html (main.js) and mock.html (mock.js)
# ════════════════════════════════════════════

class PublicView:
    """No login, no CSRF (visitors have no session), rate-limited."""

    authentication_classes = []
    permission_classes = [AllowAny]


class PublicMockExamList(PublicView, generics.ListAPIView):
    """GET /api/mock-exams/ — only open sessions (status 'upcoming' and date not passed),
    soonest first, with seat counts."""

    serializer_class = PublicMockExamSerializer
    pagination_class = None

    def get_queryset(self):
        return (
            exams_with_counts()
            .filter(status="upcoming", exam_date__gte=timezone.now())
            .order_by("exam_date")
        )


class PublicTrialRegistrationCreate(PublicView, generics.CreateAPIView):
    """POST /api/trial-registrations/ — both lead forms on the main site
    (source "course_card" = course modal, "apply_form" = «Оставить заявку»)."""

    serializer_class = PublicTrialRegistrationSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_forms"

    def perform_create(self, serializer):
        lead = serializer.save()
        telegram.send_after_commit(telegram.trial_lead_text(lead))


class PublicExamRegistrationCreate(PublicView, APIView):
    """POST /api/exam-registrations/ — sign up for a mock exam.

    The student also sets a password. It becomes (or must match) the password of their
    portal account, which logs in with phone + password; Django stores only a hash.
    If the phone number already has a portal account, the password must be that account's
    password: nobody can attach a registration to someone else's account.

    Errors the website understands:
      409 {"code": "EXAM_FULL"}           all seats are taken
      409 {"code": "EXAM_CLOSED"}         exam is not 'upcoming' or its date has passed
      409 {"code": "ALREADY_REGISTERED"}  this student is already signed up for this exam
      403 {"code": "ACCOUNT_EXISTS"}      the phone has an account and the password is different
      400 {"password": [...]}             password too weak
    """

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_forms"

    def post(self, request):
        serializer = PublicExamRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        password = serializer.validated_data["password"]
        digits = normalize_phone(serializer.validated_data["phone"])
        if not digits:
            raise ValidationError({"phone": ["Введите номер телефона полностью."]})

        with transaction.atomic():
            # Lock the exam row so two people can't take the last seat at the same time.
            exam = MockExam.objects.select_for_update().get(
                pk=serializer.validated_data["exam"].pk
            )
            if not exam.is_open_for_registration():
                return Response(
                    {"code": "EXAM_CLOSED", "detail": "Запись на этот экзамен закрыта."},
                    status=status.HTTP_409_CONFLICT,
                )
            if exam.registrations.count() >= exam.max_seats:
                return Response(
                    {"code": "EXAM_FULL", "detail": "Все места на этот экзамен заняты."},
                    status=status.HTTP_409_CONFLICT,
                )

            profile = Profile.objects.select_related("user").filter(phone=digits).first()
            if profile is None:
                try:
                    validate_password(password)
                except DjangoValidationError as e:
                    raise ValidationError({"password": list(e.messages)})
                # No email on the User row on purpose: see portal/models.py.
                user = get_user_model().objects.create_user(new_username(), "", password)
                profile = Profile.objects.create(
                    user=user, role="student", approved=True, phone=digits,
                    full_name=" ".join(serializer.validated_data["full_name"].split()),
                    note="Mock exam",
                )
            else:
                ok = profile.role == "student" and authenticate(
                    request, username=profile.user.username, password=password
                ) is not None
                if not ok:
                    return Response(
                        {"code": "ACCOUNT_EXISTS",
                         "detail": "На этот номер уже есть кабинет. Введите пароль от него."},
                        status=status.HTTP_403_FORBIDDEN,
                    )
                if ExamRegistration.objects.filter(exam=exam, student=profile).exists():
                    return Response(
                        {"code": "ALREADY_REGISTERED", "detail": "Вы уже записаны на этот экзамен."},
                        status=status.HTTP_409_CONFLICT,
                    )

            # Payment is never trusted from the browser: an admin verifies it in admin.html.
            # amount_paid stays empty until then; the price goes into amount_due.
            registration = serializer.save(
                exam=exam,
                student=profile,
                format="computer",  # all mocks are computer-delivered (CD)
                payment_status="pending",
                amount_due=exam.price_uzs or DEFAULT_EXAM_PRICE_UZS,
                amount_paid=None,
            )
            # ticket_no is created by a database trigger; read it back.
            registration.refresh_from_db(fields=["ticket_no"])
            telegram.send_after_commit(telegram.exam_registration_text(registration))

        return Response(
            PublicExamRegistrationSerializer(registration).data,
            status=status.HTTP_201_CREATED,
        )


def phone_digits(value):
    """Last 9 digits of a phone number, so "+998 90 123-45-67" and "901234567" match."""
    return re.sub(r"\D", "", str(value or ""))[-9:]


class MockResultLookup(PublicView, APIView):
    """POST /api/mock-results/lookup/ {ticket_no, phone} — a student checks their mock result.

    Both the ticket number AND the phone must match. A wrong pair gets the same
    404 as an unknown ticket, so the endpoint cannot be used to test numbers.
    Rate-limited (scope "result_lookup").
      200 {"ready": true, listening, reading, writing, speaking, overall, ...}
      200 {"ready": false}       found, but staff have not entered the scores yet
      404 {"code": "NOT_FOUND"}
    """

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "result_lookup"

    def post(self, request):
        data = MockResultLookupSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        ticket = data.validated_data["ticket_no"].strip().upper()
        phone = phone_digits(data.validated_data["phone"])
        not_found = Response({"code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        if len(phone) < 9 or not ticket:
            return not_found
        reg = ExamRegistration.objects.select_related("exam").filter(ticket_no__iexact=ticket).first()
        if reg is None or phone_digits(reg.phone) != phone:
            return not_found
        # Scores stay hidden until staff press «Completed» (publish).
        ready = reg.overall is not None and reg.results_published_at is not None
        result = {
            "ready": ready,
            "first_name": reg.first_name or (reg.full_name or "").split(" ")[0],
            "exam_title": reg.exam.title if reg.exam else "",
            "exam_date": reg.exam.exam_date if reg.exam else None,
            "ticket_no": reg.ticket_no,
        }
        if ready:
            for band in ("listening", "reading", "writing", "speaking", "overall"):
                result[band] = float(getattr(reg, band))
        return Response(result)


# ════════════════════════════════════════════
# RESULTS, TEACHERS & NEWS — photo stored in the database
# ════════════════════════════════════════════

def with_has_image(qs):
    """Never load the photo bytes for lists; only note whether there is one."""
    return qs.defer("image").annotate(
        has_image=ExpressionWrapper(Q(image__isnull=False), output_field=BooleanField())
    )


def photo_response(model, pk, request):
    """The photo of a published row; staff may also see photos of unpublished rows."""
    qs = model.objects.filter(pk=pk)
    if get_role(request.user) is None:
        qs = qs.filter(is_published=True)
    row = qs.only("image", "content_type").first()
    if row is None or row.image is None:
        raise Http404
    response = HttpResponse(bytes(row.image), content_type=row.content_type)
    # The URL changes (?v=) whenever the photo changes, so it can be cached for long.
    response["Cache-Control"] = "public, max-age=31536000, immutable"
    return response


@require_GET
def result_image(request, pk):
    """GET /api/results/<id>/image/"""
    return photo_response(StudentResult, pk, request)


@require_GET
def teacher_image(request, pk):
    """GET /api/teachers/<id>/image/"""
    return photo_response(Teacher, pk, request)


class PublicResultList(PublicView, generics.ListAPIView):
    """GET /api/results/ — published results, in the order set in the admin panel."""

    serializer_class = PublicStudentResultSerializer
    pagination_class = None

    def get_queryset(self):
        return with_has_image(StudentResult.objects.filter(is_published=True)).order_by("position", "id")


class PublicTeacherList(PublicView, generics.ListAPIView):
    """GET /api/teachers/ — published teachers, in the order set in the admin panel."""

    serializer_class = PublicTeacherSerializer
    pagination_class = None

    def get_queryset(self):
        return with_has_image(Teacher.objects.filter(is_published=True)).order_by("position", "id")


class PhotoRowAdminMixin:
    """Admin create/update for models with an optional photo.

    Multipart fields: the normal fields, plus `image` (a new photo) or
    `remove_image=1` (delete the current photo).
    """

    model = None
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    pagination_class = None

    def get_queryset(self):
        return with_has_image(self.model.objects.all()).order_by("position", "id")

    def photo_fields(self):
        upload = self.request.FILES.get("image")
        if upload is not None:
            try:
                data, width, height = process_upload(upload)
            except ImageError as e:
                raise ValidationError({"detail": str(e)})
            return dict(image=data, content_type="image/jpeg", width=width, height=height)
        if str(self.request.data.get("remove_image", "")).lower() in ("1", "true"):
            return dict(image=None, width=0, height=0)
        return {}

    def perform_create(self, serializer):
        last = self.model.objects.aggregate(m=Max("position"))["m"]
        serializer.save(position=(last + 1) if last is not None else 0, **self.photo_fields())

    def perform_update(self, serializer):
        fields = self.photo_fields()
        row = serializer.save(**fields)
        if "image" in fields:  # the list annotation is stale after a photo change
            row.has_image = fields["image"] is not None


class AdminResultList(PhotoRowAdminMixin, generics.ListCreateAPIView):
    """GET/POST /api/admin/results/"""

    model = StudentResult
    serializer_class = AdminStudentResultSerializer


class AdminResultDetail(PhotoRowAdminMixin, generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/admin/results/<id>/ — DELETE is owner-only."""

    model = StudentResult
    serializer_class = AdminStudentResultSerializer


class AdminTeacherList(PhotoRowAdminMixin, generics.ListCreateAPIView):
    """GET/POST /api/admin/teachers/"""

    model = Teacher
    serializer_class = AdminTeacherSerializer


class AdminTeacherDetail(PhotoRowAdminMixin, generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/admin/teachers/<id>/ — DELETE is owner-only."""

    model = Teacher
    serializer_class = AdminTeacherSerializer


class ReorderView(APIView):
    """POST {"ids": [3, 1, 2]} — new display order."""

    model = None
    serializer_class = None

    def post(self, request):
        ids = request.data.get("ids")
        if not isinstance(ids, list) or not all(isinstance(i, int) for i in ids):
            return Response({"detail": "ids должен быть списком id"}, status=400)
        with transaction.atomic():
            for position, pk in enumerate(ids):
                self.model.objects.filter(pk=pk).update(position=position)
        qs = with_has_image(self.model.objects.all()).order_by("position", "id")
        return Response(self.serializer_class(qs, many=True).data)


class AdminResultReorder(ReorderView):
    """POST /api/admin/results/reorder/"""

    model = StudentResult
    serializer_class = AdminStudentResultSerializer


class AdminTeacherReorder(ReorderView):
    """POST /api/admin/teachers/reorder/"""

    model = Teacher
    serializer_class = AdminTeacherSerializer


# ════════════════════════════════════════════
# AUTH — used by admin.html (admin.js)
# ════════════════════════════════════════════

def session_payload(user):
    role = get_role(user)
    if role is None:
        return {"authenticated": False}
    return {"authenticated": True, "email": user.email or user.username, "role": role}


@method_decorator(ensure_csrf_cookie, name="dispatch")
class MeView(APIView):
    """GET /api/auth/me/ — who is logged in. Also sets the CSRF cookie admin.js needs."""

    permission_classes = [AllowAny]

    def get(self, request):
        return Response(session_payload(request.user))


class LoginView(APIView):
    """POST /api/auth/login/ {email, password}"""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        email = str(request.data.get("email", "")).strip()
        password = str(request.data.get("password", ""))
        if not email or not password:
            return Response({"detail": "Введите email и пароль"}, status=400)

        User = get_user_model()
        account = User.objects.filter(email__iexact=email).first()
        username = account.get_username() if account else email
        user = authenticate(request, username=username, password=password)
        if user is None:
            return Response({"detail": "Неверный email или пароль"}, status=400)
        if get_role(user) is None:
            return Response(
                {"detail": "Вас нет в списке сотрудников (staff_roles). Попросите владельца добавить вас."},
                status=403,
            )
        login(request, user)
        return Response(session_payload(user))


class LogoutView(APIView):
    """POST /api/auth/logout/"""

    permission_classes = [AllowAny]

    def post(self, request):
        logout(request)
        return Response({"authenticated": False})


# ════════════════════════════════════════════
# ADMIN — staff login required; DELETE is owner-only (see permissions.py)
# ════════════════════════════════════════════

class AdminDashboard(APIView):
    """GET /api/admin/dashboard/ — numbers and recent activity for the dashboard page."""

    def get(self, request):
        recent_students = TrialRegistration.objects.order_by("-created_at")[:5]
        recent_exam_regs = ExamRegistration.objects.order_by("-registered_at")[:5]
        return Response({
            "total_exams": MockExam.objects.count(),
            "upcoming_exams": MockExam.objects.filter(status="upcoming").count(),
            "total_students": TrialRegistration.objects.count(),
            "new_students": TrialRegistration.objects.filter(status="new").count(),
            "recent_students": AdminTrialRegistrationSerializer(recent_students, many=True).data,
            "recent_exam_registrations": AdminExamRegistrationSerializer(recent_exam_regs, many=True).data,
        })


class AdminExamList(generics.ListCreateAPIView):
    """GET/POST /api/admin/exams/?status=upcoming"""

    serializer_class = AdminMockExamSerializer
    pagination_class = None

    def get_queryset(self):
        qs = exams_with_counts().order_by("-exam_date")
        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        serializer.save(created_by=user.email or user.username)


class AdminExamDetail(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/admin/exams/<id>/ — deleting also removes its registrations."""

    serializer_class = AdminMockExamSerializer

    def get_queryset(self):
        return exams_with_counts()


class AdminExamRegistrationList(generics.ListAPIView):
    """GET /api/admin/exams/<id>/registrations/"""

    serializer_class = AdminExamRegistrationSerializer
    pagination_class = None

    def get_queryset(self):
        return ExamRegistration.objects.filter(exam_id=self.kwargs["pk"]).order_by("-registered_at")


class AdminExamRegistrationDetail(generics.RetrieveUpdateAPIView):
    """PATCH /api/admin/exam-registrations/<id>/ {payment_status, listening, reading,
    writing, speaking, attended} — overall is calculated by the server."""

    serializer_class = AdminExamRegistrationSerializer
    queryset = ExamRegistration.objects.all()


class AdminStudentList(generics.ListAPIView):
    """GET /api/admin/students/?status=new&course=ielts"""

    serializer_class = AdminTrialRegistrationSerializer
    pagination_class = None

    def get_queryset(self):
        qs = TrialRegistration.objects.order_by("-created_at")
        params = self.request.query_params
        if params.get("status"):
            qs = qs.filter(status=params["status"])
        if params.get("course"):
            qs = qs.filter(course=params["course"])
        return qs


class AdminStudentDetail(generics.RetrieveUpdateAPIView):
    """PATCH /api/admin/students/<id>/ {status, staff_note}"""

    serializer_class = AdminTrialRegistrationSerializer
    queryset = TrialRegistration.objects.all()


# ════════════════════════════════════════════
# NEWS, EVENTS, SPEAKING CLUBS — shown right after the first screen of index.html
# ════════════════════════════════════════════

@require_GET
def news_image(request, pk):
    """GET /api/news/<id>/image/"""
    return photo_response(News, pk, request)


class PublicNewsList(PublicView, generics.ListAPIView):
    """GET /api/news/ — published posts. Upcoming events and clubs come first (soonest on top);
    after them the other posts, newest first. Events that already started are left out."""

    serializer_class = PublicNewsSerializer
    pagination_class = None

    def get_queryset(self):
        rows = list(
            with_has_image(News.objects.filter(is_published=True))
            .exclude(event_date__lt=timezone.now())
            .order_by("-created_at")[:60]
        )
        upcoming = sorted((n for n in rows if n.event_date), key=lambda n: n.event_date)
        others = [n for n in rows if not n.event_date]
        return upcoming + others


class AdminNewsMixin(PhotoRowAdminMixin):
    model = News
    serializer_class = AdminNewsSerializer

    def get_queryset(self):
        return with_has_image(News.objects.all()).order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(**self.photo_fields())


class AdminNewsList(AdminNewsMixin, generics.ListCreateAPIView):
    """GET/POST /api/admin/news/ — JSON, or multipart with an `image` photo."""


class AdminNewsDetail(AdminNewsMixin, generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/admin/news/<id>/ — DELETE is owner-only."""


# ════════════════════════════════════════════
# ANALYTICS — page views (public, insert-only) and the staff dashboard
# ════════════════════════════════════════════

PAGE_PATHS = {"": "/", "index": "/", "mock": "/mock.html", "portal": "/portal.html"}


class PageViewCreate(PublicView, APIView):
    """POST /api/analytics/hit/ {path, visitor_id, referrer, device} -> 204.

    Insert-only for visitors. Nothing personal is kept: no IP address, no user agent.
    The referrer is cut down to the host name of the site that linked here.
    """

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "analytics"

    def post(self, request):
        raw_path = str(request.data.get("path", ""))[:200].split("?")[0].split("#")[0]
        name = raw_path.strip("/").lower()
        if name.endswith(".html"):
            name = name[:-5]
        path = PAGE_PATHS.get(name)
        try:
            visitor = uuid.UUID(str(request.data.get("visitor_id", "")))
        except ValueError:
            visitor = None
        if path is None or visitor is None:
            return Response(status=status.HTTP_400_BAD_REQUEST)

        host = (urlparse(str(request.data.get("referrer", ""))[:500]).hostname or "").lower()
        if host.startswith("www."):
            host = host[4:]
        own_host = request.get_host().split(":")[0].lower()
        if host == own_host or host == own_host.removeprefix("www."):
            host = ""  # moved around inside our own site
        device = "mobile" if request.data.get("device") == "mobile" else "desktop"
        PageView.objects.create(path=path, visitor_id=visitor, referrer=host[:100], device=device)
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminAnalytics(APIView):
    """GET /api/admin/analytics/ — numbers for today, the last 7 days and the last 30 days
    (days are Tashkent days), views per page, and a daily series for the chart."""

    PERIODS = {"today": 0, "d7": 6, "d30": 29}

    def get(self, request):
        today = timezone.localdate()

        def day_start(day):
            return timezone.make_aware(datetime.combine(day, time.min))

        periods, pages = {}, {}
        for key, back in self.PERIODS.items():
            since = day_start(today - timedelta(days=back))
            views = PageView.objects.filter(created_at__gte=since)
            totals = views.aggregate(views=Count("id"), visitors=Count("visitor_id", distinct=True))
            registrations = ExamRegistration.objects.filter(registered_at__gte=since).count()
            visitors = totals["visitors"]
            periods[key] = {
                "visitors": visitors,
                "views": totals["views"],
                "registrations": registrations,
                # registrations ÷ unique visitors, in percent (None while there are no visitors)
                "conversion": round(registrations * 100 / visitors, 1) if visitors else None,
            }
            pages[key] = list(
                views.values("path")
                .annotate(views=Count("id"), visitors=Count("visitor_id", distinct=True))
                .order_by("-views", "path")
            )

        first = today - timedelta(days=29)
        since = day_start(first)
        by_day_views = {
            row["day"]: row for row in PageView.objects.filter(created_at__gte=since)
            .annotate(day=TruncDate("created_at")).values("day")
            .annotate(views=Count("id"), visitors=Count("visitor_id", distinct=True))
        }
        by_day_regs = {
            row["day"]: row["n"] for row in ExamRegistration.objects.filter(registered_at__gte=since)
            .annotate(day=TruncDate("registered_at")).values("day").annotate(n=Count("id"))
        }
        daily = []
        for i in range(30):
            day = first + timedelta(days=i)
            v = by_day_views.get(day, {})
            daily.append({
                "date": day.isoformat(),
                "visitors": v.get("visitors", 0),
                "views": v.get("views", 0),
                "registrations": by_day_regs.get(day, 0),
            })
        return Response({"periods": periods, "pages": pages, "daily": daily})


# ════════════════════════════════════════════
# MOCK EXAM BOARD — Upcoming / Taken (awaiting scores) / Completed
# ════════════════════════════════════════════

def split_name(reg):
    first, last = reg.first_name, reg.last_name
    if not first and not last:
        parts = (reg.full_name or "").split(None, 1)
        first, last = (parts[0] if parts else ""), (parts[1] if len(parts) > 1 else "")
    return first or "", last or ""


def board_row(reg):
    """One student row. Never contains a password (there is none on this table)."""
    first, last = split_name(reg)

    def band(v):
        return float(v) if v is not None else None

    return {
        "id": reg.id,
        "ticket_no": reg.ticket_no,
        "first_name": first,
        "last_name": last,
        "phone": reg.phone,
        "exam_id": reg.exam_id,
        "exam_title": reg.exam.title,
        "exam_date": reg.exam.exam_date,
        "payment_status": reg.payment_status,
        "listening": band(reg.listening),
        "reading": band(reg.reading),
        "writing": band(reg.writing),
        "speaking": band(reg.speaking),
        "overall": band(reg.overall),
        "results_published_at": reg.results_published_at,
        "results_published_by": reg.results_published_by,
    }


def board_querysets():
    now = timezone.now()
    base = (
        ExamRegistration.objects.select_related("exam")
        .filter(exam__isnull=False).exclude(exam__status="cancelled")
    )
    unpublished = base.filter(results_published_at__isnull=True)
    return {
        "upcoming": unpublished.filter(exam__exam_date__gte=now).order_by("exam__exam_date", "registered_at", "id"),
        "taken": unpublished.filter(exam__exam_date__lt=now).order_by("exam__exam_date", "registered_at", "id"),
        "completed": base.filter(results_published_at__isnull=False).order_by("-results_published_at", "-id"),
    }


class AdminMockBoard(APIView):
    """GET /api/admin/mock-board/?tab=upcoming|taken|completed — students for one tab, plus
    the size of every tab."""

    def get(self, request):
        tab = request.query_params.get("tab", "upcoming")
        tabs = board_querysets()
        if tab not in tabs:
            return Response({"detail": "Unknown tab."}, status=400)
        return Response({
            "counts": {name: qs.count() for name, qs in tabs.items()},
            "rows": [board_row(r) for r in tabs[tab]],
        })


class AdminPublishResult(APIView):
    """POST /api/admin/exam-registrations/<id>/publish/ — the «Completed» button.

    Needs all four scores and an exam date that has passed. Afterwards the student sees
    the scores in their portal, and staff see who published them and when.
    """

    def post(self, request, pk):
        reg = get_object_or_404(ExamRegistration.objects.select_related("exam"), pk=pk)
        if reg.results_published_at is None:
            if None in (reg.listening, reg.reading, reg.writing, reg.speaking):
                return Response({"detail": "Сначала сохраните все четыре балла."}, status=400)
            if reg.exam is None or reg.exam.exam_date > timezone.now():
                return Response({"detail": "Экзамен ещё не прошёл."}, status=400)
            reg.results_published_at = timezone.now()
            reg.results_published_by = request.user.email or request.user.username
            reg.save(update_fields=["results_published_at", "results_published_by"])
        return Response(board_row(reg))


class AdminUnpublishResult(APIView):
    """POST /api/admin/exam-registrations/<id>/unpublish/ — owner only: hide the result
    again so the scores can be corrected."""

    def post(self, request, pk):
        if get_role(request.user) != "owner":
            return Response({"detail": "Снять публикацию может только владелец."}, status=403)
        reg = get_object_or_404(ExamRegistration.objects.select_related("exam"), pk=pk)
        reg.results_published_at = None
        reg.results_published_by = None
        reg.save(update_fields=["results_published_at", "results_published_by"])
        return Response(board_row(reg))
