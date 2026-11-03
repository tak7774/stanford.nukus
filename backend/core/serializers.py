from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import (
    validate_band,
    ExamRegistration,
    GalleryPhoto,
    MockExam,
    News,
    StudentResult,
    Teacher,
    TrialRegistration,
)

DEFAULT_EXAM_PRICE_UZS = 150000


def band_serializer_field(**kw):
    """An IELTS band 0–9 in steps of 0.5, sent as a JSON number (7.5, not "7.5")."""
    return serializers.DecimalField(
        max_digits=3, decimal_places=1, coerce_to_string=False,
        validators=[validate_band_drf], **kw
    )


def validate_band_drf(value):
    try:
        validate_band(value)
    except DjangoValidationError as e:
        raise serializers.ValidationError(e.messages)


# ── Public (website forms) ──

class PublicMockExamSerializer(serializers.ModelSerializer):
    registered = serializers.IntegerField(read_only=True)
    seats_left = serializers.SerializerMethodField()

    class Meta:
        model = MockExam
        fields = [
            "id", "title", "description", "course_type", "exam_date",
            "duration_minutes", "max_seats", "status", "price_uzs", "location",
            "registered", "seats_left",
        ]

    def get_seats_left(self, obj):
        return max(0, obj.max_seats - (getattr(obj, "registered", 0) or 0))


class PublicTrialRegistrationSerializer(serializers.ModelSerializer):
    """Both lead forms on index.html: the course-card modal and «Оставить заявку»."""

    full_name = serializers.CharField(max_length=200)
    phone = serializers.CharField(max_length=40)
    source = serializers.ChoiceField(
        choices=TrialRegistration._meta.get_field("source").choices, default="apply_form"
    )
    comment = serializers.CharField(max_length=1000, required=False, allow_blank=True)

    class Meta:
        model = TrialRegistration
        fields = ["id", "full_name", "phone", "course", "source", "preferred_time", "comment", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate_phone(self, value):
        if len("".join(ch for ch in value if ch.isdigit())) < 9:
            raise serializers.ValidationError("Enter a full phone number.")
        return value


class PublicExamRegistrationSerializer(serializers.ModelSerializer):
    """What a visitor may send. Payment status, amount and format are set by the server."""

    exam_id = serializers.PrimaryKeyRelatedField(
        source="exam", queryset=MockExam.objects.all()
    )
    full_name = serializers.CharField(max_length=200)
    phone = serializers.CharField(max_length=40)
    first_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    gender = serializers.ChoiceField(choices=["male", "female"], required=False, allow_blank=True)
    payment_method = serializers.ChoiceField(choices=["click", "payme", "cash"], required=False, allow_blank=True)

    class Meta:
        model = ExamRegistration
        fields = [
            "id", "ticket_no", "exam_id", "full_name", "phone", "first_name", "last_name",
            "gender", "format", "payment_method",
            "payment_status", "amount_due", "amount_paid", "registered_at",
        ]
        # All mocks are computer-delivered: format is always saved as "computer".
        read_only_fields = ["id", "ticket_no", "format", "payment_status", "amount_due", "amount_paid", "registered_at"]


class MockResultLookupSerializer(serializers.Serializer):
    ticket_no = serializers.CharField(max_length=40)
    phone = serializers.CharField(max_length=40)


class PublicStudentResultSerializer(serializers.ModelSerializer):
    image_url = serializers.CharField(read_only=True)
    listening = band_serializer_field()
    reading = band_serializer_field()
    writing = band_serializer_field()
    speaking = band_serializer_field()
    overall = band_serializer_field(read_only=True)

    class Meta:
        model = StudentResult
        fields = [
            "id", "first_name", "last_name_initial", "listening", "reading", "writing",
            "speaking", "overall", "course", "exam_date", "image_url",
        ]


class PublicTeacherSerializer(serializers.ModelSerializer):
    image_url = serializers.CharField(read_only=True)
    ielts_band = band_serializer_field(allow_null=True, required=False)
    tags = serializers.ListField(source="tag_list", read_only=True)

    class Meta:
        model = Teacher
        fields = ["id", "name", "role", "ielts_band", "experience_years", "tags", "image_url"]


# ── Admin panel ──

class AdminMockExamSerializer(serializers.ModelSerializer):
    registered = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = MockExam
        fields = [
            "id", "title", "description", "course_type", "exam_date",
            "duration_minutes", "max_seats", "status", "price_uzs", "location",
            "created_by", "registered",
        ]
        read_only_fields = ["id", "created_by", "registered"]

    def validate_max_seats(self, value):
        if value < 1:
            raise serializers.ValidationError("Must be at least 1.")
        return value

    def validate_price_uzs(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Cannot be negative.")
        return value

    def validate_duration_minutes(self, value):
        if value < 1:
            raise serializers.ValidationError("Must be at least 1.")
        return value


class AdminExamRegistrationSerializer(serializers.ModelSerializer):
    listening = band_serializer_field(allow_null=True, required=False)
    reading = band_serializer_field(allow_null=True, required=False)
    writing = band_serializer_field(allow_null=True, required=False)
    speaking = band_serializer_field(allow_null=True, required=False)
    overall = band_serializer_field(read_only=True)

    # Staff may change: payment status, the four mock scores and attendance.
    EDITABLE = {"payment_status", "listening", "reading", "writing", "speaking", "attended"}

    class Meta:
        model = ExamRegistration
        fields = [
            "id", "ticket_no", "exam_id", "full_name", "phone", "first_name", "last_name",
            "gender", "payment_status", "payment_method", "amount_due", "amount_paid",
            "listening", "reading", "writing", "speaking", "overall", "attended",
            "registered_at",
        ]
        read_only_fields = [
            "id", "ticket_no", "exam_id", "full_name", "phone", "first_name", "last_name",
            "gender", "payment_method", "amount_due", "amount_paid", "overall", "registered_at",
        ]

    def update(self, instance, validated_data):
        # amount_paid is only filled in when staff confirm the payment.
        if "payment_status" in validated_data:
            new_status = validated_data["payment_status"]
            validated_data["amount_paid"] = instance.amount_due if new_status == "verified" else None
        return super().update(instance, validated_data)


class AdminTrialRegistrationSerializer(serializers.ModelSerializer):
    staff_note = serializers.CharField(max_length=2000, required=False, allow_blank=True, allow_null=True)

    class Meta:
        model = TrialRegistration
        fields = [
            "id", "full_name", "phone", "course", "status", "source",
            "preferred_time", "comment", "staff_note", "created_at",
        ]
        # Staff change only the status and their own note.
        read_only_fields = ["id", "full_name", "phone", "course", "source", "preferred_time", "comment", "created_at"]


class NewsSerializer(serializers.ModelSerializer):
    title = serializers.CharField(max_length=300)

    class Meta:
        model = News
        fields = ["id", "title", "body", "created_at"]
        read_only_fields = ["id", "created_at"]


class GalleryPhotoSerializer(serializers.ModelSerializer):
    url = serializers.CharField(read_only=True)
    caption = serializers.CharField(max_length=200, required=False, allow_blank=True)

    class Meta:
        model = GalleryPhoto
        fields = ["id", "url", "caption", "size", "position", "width", "height", "created_at"]
        read_only_fields = ["id", "url", "position", "width", "height", "created_at"]


class AdminStudentResultSerializer(serializers.ModelSerializer):
    image_url = serializers.CharField(read_only=True)
    first_name = serializers.CharField(max_length=60)
    last_name_initial = serializers.CharField(max_length=3, required=False, allow_blank=True)
    listening = band_serializer_field()
    reading = band_serializer_field()
    writing = band_serializer_field()
    speaking = band_serializer_field()
    overall = band_serializer_field(read_only=True)

    class Meta:
        model = StudentResult
        fields = [
            "id", "first_name", "last_name_initial", "listening", "reading", "writing",
            "speaking", "overall", "course", "exam_date", "image_url", "is_published",
            "position", "created_at",
        ]
        read_only_fields = ["id", "overall", "image_url", "position", "created_at"]

    def validate_last_name_initial(self, value):
        value = value.strip().rstrip(".")
        return value[:1].upper() if value else ""


class AdminTeacherSerializer(serializers.ModelSerializer):
    image_url = serializers.CharField(read_only=True)
    name = serializers.CharField(max_length=120)
    role = serializers.CharField(max_length=200, required=False, allow_blank=True)
    tags = serializers.CharField(max_length=300, required=False, allow_blank=True)
    ielts_band = band_serializer_field(allow_null=True, required=False)

    class Meta:
        model = Teacher
        fields = [
            "id", "name", "role", "ielts_band", "experience_years", "tags",
            "image_url", "is_published", "position", "created_at",
        ]
        read_only_fields = ["id", "image_url", "position", "created_at"]

    def validate_experience_years(self, value):
        if value is not None and not (0 <= value <= 60):
            raise serializers.ValidationError("0–60.")
        return value
