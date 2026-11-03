from django.contrib.auth import authenticate, get_user_model, login, logout
from django.db import transaction
from django.db.models import Count, Max
from django.http import Http404, HttpResponse
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

from .images import ImageError, process_upload
from .models import ExamRegistration, GalleryPhoto, MockExam, News, TrialRegistration
from .permissions import get_role
from .serializers import (
    DEFAULT_EXAM_PRICE_UZS,
    AdminExamRegistrationSerializer,
    AdminMockExamSerializer,
    AdminTrialRegistrationSerializer,
    GalleryPhotoSerializer,
    NewsSerializer,
    PublicExamRegistrationSerializer,
    PublicMockExamSerializer,
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
    """GET /api/mock-exams/ — exams that are not cancelled, soonest first, with seat counts."""

    serializer_class = PublicMockExamSerializer
    pagination_class = None

    def get_queryset(self):
        return exams_with_counts().exclude(status="cancelled").order_by("exam_date")


class PublicNewsList(PublicView, generics.ListAPIView):
    """GET /api/news/ — published news posts, newest first."""

    serializer_class = NewsSerializer
    pagination_class = None
    queryset = News.objects.order_by("-created_at")[:50]


class PublicTrialRegistrationCreate(PublicView, generics.CreateAPIView):
    """POST /api/trial-registrations/ — trial lesson form on the main site."""

    serializer_class = PublicTrialRegistrationSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_forms"


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
                    {"code": "EXAM_CLOSED", "detail": "Registration for this exam is closed."},
                    status=status.HTTP_409_CONFLICT,
                )
            if exam.registrations.count() >= exam.max_seats:
                return Response(
                    {"code": "EXAM_FULL", "detail": "All seats for this exam are taken."},
                    status=status.HTTP_409_CONFLICT,
                )
            # Payment is never trusted from the browser: an admin verifies it in admin.html.
            registration = serializer.save(
                exam=exam,
                payment_status="pending",
                amount_paid=exam.price_uzs or DEFAULT_EXAM_PRICE_UZS,
            )

        return Response(
            PublicExamRegistrationSerializer(registration).data,
            status=status.HTTP_201_CREATED,
        )


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
            return Response({"detail": "Enter email and password"}, status=400)

        User = get_user_model()
        account = User.objects.filter(email__iexact=email).first()
        username = account.get_username() if account else email
        user = authenticate(request, username=username, password=password)
        if user is None:
            return Response({"detail": "Invalid email or password"}, status=400)
        if get_role(user) is None:
            return Response(
                {"detail": "You are not listed in staff_roles. Ask the owner to add you."},
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
    """PATCH /api/admin/exam-registrations/<id>/ {payment_status}"""

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
    """PATCH /api/admin/students/<id>/ {status}"""

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
