"""Models for the tables in Supabase.

Column names match what admin.js / main.js / mock.js already use, so existing
data keeps working. The first migration (0001) only creates a table if it
is missing, so on Supabase the existing tables and their data are left as-is.
"""
from decimal import ROUND_FLOOR, Decimal

from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

COURSE_CHOICES = [
    ("ielts", "IELTS Preparation"),
    ("general", "General English"),
    ("advanced", "Advanced English"),
    ("kids", "Kids English"),
]

# Trial lead forms on the website: "unsure" lets staff help pick a course.
LEAD_COURSE_CHOICES = COURSE_CHOICES + [("unsure", "Не знаю — помогите выбрать")]

LEAD_SOURCE_CHOICES = [
    ("course_card", "Course card"),   # "Записаться" on a course card (name + phone only)
    ("apply_form", "Apply form"),     # "Оставить заявку" block at the bottom of the page
]

PREFERRED_TIME_CHOICES = [
    ("morning", "Утро"),
    ("day", "День"),
    ("evening", "Вечер"),
]

EXAM_STATUS_CHOICES = [
    ("upcoming", "Upcoming"),
    ("in_progress", "In Progress"),
    ("completed", "Completed"),
    ("cancelled", "Cancelled"),
]

STUDENT_STATUS_CHOICES = [
    ("new", "New"),
    ("contacted", "Contacted"),
    ("enrolled", "Enrolled"),
    ("declined", "Declined"),
]

# Click/Payme are not integrated yet, so nothing is "paid" automatically:
# a registration stays "pending" until staff confirm the payment in admin.html.
PAYMENT_STATUS_CHOICES = [
    ("pending", "Pending"),
    ("verified", "Verified"),
]

EXAM_FORMAT_CHOICES = [("paper", "Paper-based"), ("computer", "Computer-delivered")]

ROLE_CHOICES = [("owner", "Owner"), ("editor", "Editor")]


class StaffRole(models.Model):
    """Which admin emails may use admin.html, and whether they are owner or editor."""

    email = models.TextField()
    role = models.TextField(choices=ROLE_CHOICES)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "staff_roles"

    def __str__(self):
        return f"{self.email} ({self.role})"


class News(models.Model):
    title = models.TextField()
    body = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "news"
        ordering = ["-created_at"]
        verbose_name_plural = "news"

    def __str__(self):
        return self.title


class TrialRegistration(models.Model):
    full_name = models.TextField()
    phone = models.TextField()
    course = models.TextField(choices=LEAD_COURSE_CHOICES)
    status = models.TextField(choices=STUDENT_STATUS_CHOICES, default="new")
    # Which website form the lead came from (empty for leads made before these forms).
    source = models.TextField(choices=LEAD_SOURCE_CHOICES, null=True, blank=True)
    preferred_time = models.TextField(choices=PREFERRED_TIME_CHOICES, null=True, blank=True)
    comment = models.TextField(null=True, blank=True)
    # Written by staff in admin.html; never shown on the website.
    staff_note = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "trial_registrations"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.full_name} — {self.course}"


# ── IELTS band scores ──

def validate_band(value):
    """0–9 in steps of 0.5."""
    if value is None:
        return
    value = Decimal(str(value))
    if value < 0 or value > 9 or (value * 2) % 1 != 0:
        raise ValidationError("Балл должен быть от 0 до 9 с шагом 0.5.")


def ielts_overall(listening, reading, writing, speaking):
    """Average of the four bands, rounded the IELTS way to the nearest 0.5.

    x.25 rounds up to x.5 and x.75 rounds up to the next whole band
    (e.g. 6.25 -> 6.5, 6.75 -> 7.0, 6.125 -> 6.0). None if any band is missing.
    """
    bands = [listening, reading, writing, speaking]
    if any(b is None for b in bands):
        return None
    avg = sum(Decimal(str(b)) for b in bands) / 4
    halves = (avg * 2 + Decimal("0.5")).to_integral_value(rounding=ROUND_FLOOR)
    return (halves / 2).quantize(Decimal("0.1"))


def band_field(**kw):
    return models.DecimalField(max_digits=3, decimal_places=1, validators=[validate_band], **kw)


class MockExam(models.Model):
    title = models.TextField()
    description = models.TextField(null=True, blank=True)
    course_type = models.TextField(choices=COURSE_CHOICES, default="ielts")
    exam_date = models.DateTimeField()
    duration_minutes = models.IntegerField(default=120)
    max_seats = models.IntegerField(default=30)
    status = models.TextField(choices=EXAM_STATUS_CHOICES, default="upcoming")
    created_by = models.TextField(null=True, blank=True)
    price_uzs = models.IntegerField(null=True, blank=True, default=150000)
    location = models.TextField(null=True, blank=True, default="Stanford Main Center, Nukus")
    exam_format = models.TextField(null=True, blank=True, default="Paper-based")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "mock_exams"
        ordering = ["-exam_date"]

    def __str__(self):
        return self.title

    def is_open_for_registration(self):
        return self.status == "upcoming" and self.exam_date > timezone.now()


class ExamRegistration(models.Model):
    exam = models.ForeignKey(
        MockExam,
        on_delete=models.CASCADE,
        db_column="exam_id",
        related_name="registrations",
        null=True,
        blank=True,
    )
    full_name = models.TextField()
    phone = models.TextField()
    first_name = models.TextField(null=True, blank=True)
    last_name = models.TextField(null=True, blank=True)
    # No longer asked for or saved; the column is kept so old rows are not lost.
    birth_date = models.DateField(null=True, blank=True)
    gender = models.TextField(null=True, blank=True)
    # All mocks are computer-delivered (CD) now; the server always saves "computer".
    format = models.TextField(choices=EXAM_FORMAT_CHOICES, null=True, blank=True)
    # Filled in by a database trigger on insert: ST-<year>-MOCK-<id padded to 4>.
    ticket_no = models.TextField(unique=True, null=True, blank=True, editable=False)
    payment_status = models.TextField(
        choices=PAYMENT_STATUS_CHOICES, default="pending", null=True, blank=True
    )
    payment_method = models.TextField(null=True, blank=True)
    # amount_due: the exam price at sign-up. amount_paid: only set once staff confirm payment.
    amount_due = models.IntegerField(null=True, blank=True)
    amount_paid = models.IntegerField(null=True, blank=True)
    # Mock result, entered by staff after the exam. overall is calculated on save.
    listening = band_field(null=True, blank=True)
    reading = band_field(null=True, blank=True)
    writing = band_field(null=True, blank=True)
    speaking = band_field(null=True, blank=True)
    overall = band_field(null=True, blank=True, editable=False)
    attended = models.BooleanField(null=True, blank=True)
    registered_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "exam_registrations"
        ordering = ["-registered_at"]

    def __str__(self):
        return f"{self.full_name} → {self.exam_id}"

    def save(self, *args, **kwargs):
        set_overall(self, kwargs)
        super().save(*args, **kwargs)


def set_overall(obj, save_kwargs):
    """Recalculate obj.overall before saving (also when only some fields are saved)."""
    obj.overall = ielts_overall(obj.listening, obj.reading, obj.writing, obj.speaking)
    if save_kwargs.get("update_fields") is not None:
        save_kwargs["update_fields"] = set(save_kwargs["update_fields"]) | {"overall"}


GALLERY_SIZE_CHOICES = [
    ("normal", "Normal (1×1)"),
    ("tall", "Tall (1×2)"),
    ("wide", "Wide (2×1)"),
]


class GalleryPhoto(models.Model):
    """A photo in the «Жизнь центра изнутри» section. New table, created by Django.

    The image itself is stored in the database (already resized and compressed
    to ~200–300 KB), so no separate file storage or extra keys are needed.
    """

    image = models.BinaryField()
    content_type = models.TextField(default="image/jpeg")
    width = models.IntegerField(default=0)
    height = models.IntegerField(default=0)
    caption = models.TextField(blank=True, default="")
    size = models.TextField(choices=GALLERY_SIZE_CHOICES, default="normal")
    position = models.IntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "gallery_photos"
        ordering = ["position", "id"]

    def __str__(self):
        return self.caption or f"Photo #{self.pk}"

    @property
    def url(self):
        # The version (?v=) changes when the photo is replaced, so browsers and
        # Vercel's CDN can cache each version forever.
        return f"/api/gallery/{self.pk}/image/?v={int(self.updated_at.timestamp())}"


class ImageMixin(models.Model):
    """A photo stored in the database, like GalleryPhoto (already resized and compressed)."""

    image = models.BinaryField(null=True, blank=True)
    content_type = models.TextField(default="image/jpeg")
    width = models.IntegerField(default=0)
    height = models.IntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    image_url_prefix = ""  # e.g. "/api/results/"

    class Meta:
        abstract = True

    @property
    def image_url(self):
        # Lists annotate has_image, so the photo bytes are never loaded just to build a URL.
        has_image = getattr(self, "has_image", None)
        if has_image is None:
            has_image = self.image is not None
        if not has_image:
            return None
        return f"{self.image_url_prefix}{self.pk}/image/?v={int(self.updated_at.timestamp())}"


class StudentResult(ImageMixin):
    """A real IELTS result in the «Результаты» marquee. Hidden from the site until is_published."""

    first_name = models.TextField()
    last_name_initial = models.TextField(blank=True, default="")
    listening = band_field()
    reading = band_field()
    writing = band_field()
    speaking = band_field()
    overall = band_field(editable=False)
    course = models.TextField(choices=COURSE_CHOICES, default="ielts")
    exam_date = models.DateField(null=True, blank=True)
    is_published = models.BooleanField(default=False)
    position = models.IntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now)

    image_url_prefix = "/api/results/"

    class Meta:
        db_table = "student_results"
        ordering = ["position", "id"]

    def __str__(self):
        return f"{self.first_name} {self.last_name_initial} — {self.overall}"

    def save(self, *args, **kwargs):
        set_overall(self, kwargs)
        super().save(*args, **kwargs)


class Teacher(ImageMixin):
    """A teacher card in the «Преподаватели» section. Hidden from the site until is_published."""

    name = models.TextField()
    role = models.TextField(blank=True, default="")  # specialty, e.g. "IELTS, Speaking"
    ielts_band = band_field(null=True, blank=True)
    experience_years = models.IntegerField(null=True, blank=True)
    tags = models.TextField(blank=True, default="")  # comma-separated, e.g. "IELTS, Kids"
    is_published = models.BooleanField(default=False)
    position = models.IntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now)

    image_url_prefix = "/api/teachers/"

    class Meta:
        db_table = "teachers"
        ordering = ["position", "id"]

    def __str__(self):
        return self.name

    @property
    def tag_list(self):
        return [t.strip() for t in self.tags.split(",") if t.strip()]
