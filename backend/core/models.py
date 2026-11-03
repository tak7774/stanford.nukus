"""Models for the 5 tables that already exist in Supabase.

Column names match what admin.js / main.js / mock.js already use, so existing
data keeps working. The first migration (0001) only creates a table if it
is missing, so on Supabase the existing tables and their data are left as-is.
"""
from django.db import models
from django.utils import timezone

COURSE_CHOICES = [
    ("ielts", "IELTS Preparation"),
    ("general", "General English"),
    ("advanced", "Advanced English"),
    ("kids", "Kids English"),
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

PAYMENT_STATUS_CHOICES = [
    ("pending", "Pending"),
    ("paid", "Paid"),
    ("verified", "Verified"),
]

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
    course = models.TextField(choices=COURSE_CHOICES)
    status = models.TextField(choices=STUDENT_STATUS_CHOICES, default="new")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "trial_registrations"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.full_name} — {self.course}"


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
    birth_date = models.DateField(null=True, blank=True)
    gender = models.TextField(null=True, blank=True)
    passport_id = models.TextField(null=True, blank=True)
    payment_status = models.TextField(
        choices=PAYMENT_STATUS_CHOICES, default="pending", null=True, blank=True
    )
    payment_method = models.TextField(null=True, blank=True)
    amount_paid = models.IntegerField(null=True, blank=True)
    registered_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "exam_registrations"
        ordering = ["-registered_at"]

    def __str__(self):
        return f"{self.full_name} → {self.exam_id}"


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
