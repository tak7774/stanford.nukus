from rest_framework import serializers

from .models import ExamRegistration, GalleryPhoto, MockExam, News, TrialRegistration

DEFAULT_EXAM_PRICE_UZS = 150000


# ── Public (website forms) ──

class PublicMockExamSerializer(serializers.ModelSerializer):
    registered = serializers.IntegerField(read_only=True)
    seats_left = serializers.SerializerMethodField()

    class Meta:
        model = MockExam
        fields = [
            "id", "title", "description", "course_type", "exam_date",
            "duration_minutes", "max_seats", "status", "price_uzs", "location",
            "exam_format", "registered", "seats_left",
        ]

    def get_seats_left(self, obj):
        return max(0, obj.max_seats - (getattr(obj, "registered", 0) or 0))


class PublicTrialRegistrationSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(max_length=200)
    phone = serializers.CharField(max_length=40)

    class Meta:
        model = TrialRegistration
        fields = ["id", "full_name", "phone", "course", "created_at"]
        read_only_fields = ["id", "created_at"]


class PublicExamRegistrationSerializer(serializers.ModelSerializer):
    """What a visitor may send. Payment status and amount are set by the server."""

    exam_id = serializers.PrimaryKeyRelatedField(
        source="exam", queryset=MockExam.objects.all()
    )
    full_name = serializers.CharField(max_length=200)
    phone = serializers.CharField(max_length=40)
    first_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    gender = serializers.CharField(max_length=20, required=False, allow_blank=True)
    payment_method = serializers.CharField(max_length=30, required=False, allow_blank=True)

    class Meta:
        model = ExamRegistration
        fields = [
            "id", "ticket_no", "exam_id", "full_name", "phone", "first_name", "last_name",
            "birth_date", "gender", "format", "payment_method",
            "payment_status", "amount_due", "amount_paid", "registered_at",
        ]
        read_only_fields = ["id", "ticket_no", "payment_status", "amount_due", "amount_paid", "registered_at"]


# ── Admin panel ──

class AdminMockExamSerializer(serializers.ModelSerializer):
    registered = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = MockExam
        fields = [
            "id", "title", "description", "course_type", "exam_date",
            "duration_minutes", "max_seats", "status", "price_uzs", "location",
            "exam_format", "created_by", "registered",
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
    class Meta:
        model = ExamRegistration
        fields = [
            "id", "ticket_no", "exam_id", "full_name", "phone", "first_name", "last_name",
            "birth_date", "gender", "format", "payment_status",
            "payment_method", "amount_due", "amount_paid", "registered_at",
        ]
        # The admin panel only changes the payment status.
        read_only_fields = [f for f in fields if f != "payment_status"]

    def update(self, instance, validated_data):
        # amount_paid is only filled in when staff confirm the payment.
        new_status = validated_data.get("payment_status", instance.payment_status)
        validated_data["amount_paid"] = instance.amount_due if new_status == "verified" else None
        return super().update(instance, validated_data)


class AdminTrialRegistrationSerializer(serializers.ModelSerializer):
    class Meta:
        model = TrialRegistration
        fields = ["id", "full_name", "phone", "course", "status", "created_at"]
        read_only_fields = ["id", "full_name", "phone", "course", "created_at"]


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
