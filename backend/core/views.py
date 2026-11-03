from django.contrib.auth import authenticate, get_user_model, login, logout
from django.db import transaction
import re

from django.db.models import BooleanField, Count, ExpressionWrapper, Max, Q
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

from . import telegram
from .images import ImageError, process_upload
from .models import (
    ExamRegistration,
    GalleryPhoto,
    MockExam,
    News,
    StudentResult,
    Teacher,
    TrialRegistration,
)
from .permissions import get_role
from .serializers import (
    DEFAULT_EXAM_PRICE_UZS,
    AdminExamRegistrationSerializer,
    AdminMockExamSerializer,
    AdminStudentResultSerializer,
    AdminTeacherSerializer,
    AdminTrialRegistrationSerializer,
    GalleryPhotoSerializer,
    MockResultLookupSerializer,
    NewsSerializer,
    PublicExamRegistrationSerializer,
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


class PublicNewsList(PublicView, generics.ListAPIView):
    """GET /api/news/ — published news posts, newest first."""

    serializer_class = NewsSerializer
    pagination_class = None
    queryset = News.objects.order_by("-created_at")[:50]


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

    Errors the website understands:
      409 {"code": "EXAM_FULL"}    all seats are taken
      409 {"code": "EXAM_CLOSED"}  exam is not 'upcoming' or its date has passed
    """

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_forms"

    def post(self, request):
        serializer = PublicExamRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

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
            # Payment is never trusted from the browser: an admin verifies it in admin.html.
            # amount_paid stays empty until then; the price goes into amount_due.
            registration = serializer.save(
                exam=exam,
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
        result = {
            "ready": reg.overall is not None,
            "first_name": reg.first_name or (reg.full_name or "").split(" ")[0],
            "exam_title": reg.exam.title if reg.exam else "",
            "exam_date": reg.exam.exam_date if reg.exam else None,
            "ticket_no": reg.ticket_no,
        }
        if reg.overall is not None:
            for band in ("listening", "reading", "writing", "speaking", "overall"):
                result[band] = float(getattr(reg, band))
        return Response(result)


# ════════════════════════════════════════════
# RESULTS & TEACHERS — photo stored in the database, like the gallery
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


class AdminNewsList(generics.ListCreateAPIView):
    """GET/POST /api/admin/news/"""

    serializer_class = NewsSerializer
    pagination_class = None
    queryset = News.objects.order_by("-created_at")


class AdminNewsDetail(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/admin/news/<id>/"""

    serializer_class = NewsSerializer
    queryset = News.objects.all()


# ════════════════════════════════════════════
# GALLERY — «Жизнь центра изнутри»
# ════════════════════════════════════════════

def gallery_queryset():
    # Never load the image bytes when only listing photos.
    return GalleryPhoto.objects.defer("image").order_by("position", "id")


class PublicGalleryList(PublicView, generics.ListAPIView):
    """GET /api/gallery/ — photos for the website, in display order."""

    serializer_class = GalleryPhotoSerializer
    pagination_class = None

    def get_queryset(self):
        return gallery_queryset()


@require_GET
def gallery_image(request, pk):
    """GET /api/gallery/<id>/image/ — the photo itself (cached by browsers and Vercel)."""
    photo = GalleryPhoto.objects.filter(pk=pk).only("image", "content_type").first()
    if photo is None:
        raise Http404
    response = HttpResponse(bytes(photo.image), content_type=photo.content_type)
    response["Cache-Control"] = "public, max-age=31536000, immutable"
    return response


class AdminGalleryList(generics.ListCreateAPIView):
    """GET /api/admin/gallery/ ; POST (multipart: image, caption, size) uploads a photo."""

    serializer_class = GalleryPhotoSerializer
    pagination_class = None
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        return gallery_queryset()

    def create(self, request, *args, **kwargs):
        upload = request.FILES.get("image")
        if upload is None:
            return Response({"detail": "Выберите фото."}, status=400)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            data, width, height = process_upload(upload)
        except ImageError as e:
            return Response({"detail": str(e)}, status=400)
        last = GalleryPhoto.objects.aggregate(m=Max("position"))["m"]
        photo = serializer.save(
            image=data, content_type="image/jpeg", width=width, height=height,
            position=(last + 1) if last is not None else 0,
        )
        return Response(self.get_serializer(photo).data, status=201)


class AdminGalleryDetail(generics.RetrieveUpdateDestroyAPIView):
    """PATCH /api/admin/gallery/<id>/ (caption, size, optional new image) ; DELETE (owner only)."""

    serializer_class = GalleryPhotoSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        return gallery_queryset()

    def perform_update(self, serializer):
        extra = {}
        upload = self.request.FILES.get("image")
        if upload is not None:
            try:
                data, width, height = process_upload(upload)
            except ImageError as e:
                raise ValidationError({"detail": str(e)})
            extra = dict(image=data, content_type="image/jpeg", width=width, height=height)
        serializer.save(**extra)


class AdminGalleryReorder(APIView):
    """POST /api/admin/gallery/reorder/ {"ids": [3, 1, 2]} — new display order."""

    def post(self, request):
        ids = request.data.get("ids")
        if not isinstance(ids, list) or not all(isinstance(i, int) for i in ids):
            return Response({"detail": "ids must be a list of photo ids"}, status=400)
        with transaction.atomic():
            for position, pk in enumerate(ids):
                GalleryPhoto.objects.filter(pk=pk).update(position=position)
        return Response(GalleryPhotoSerializer(gallery_queryset(), many=True).data)
