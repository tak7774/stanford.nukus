"""Student / teacher portal (kabinet.html): accounts, groups, lessons, homework, books.

Portal people are ordinary Django users, but they are NOT staff: their User row has
no email and a random username, so core.permissions.get_role() (which matches the
email against staff_roles) can never treat them as staff. The real email and phone
live on Profile.
"""
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

ROLE_CHOICES = [("student", "Студент"), ("teacher", "Преподаватель")]
BOOK_KIND_CHOICES = [("pdf", "PDF"), ("audio", "Аудио"), ("link", "Ссылка")]
SUBMISSION_STATUS_CHOICES = [("submitted", "На проверке"), ("reviewed", "Проверено")]


def new_username():
    return "portal-" + uuid.uuid4().hex[:20]


class Profile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="portal_profile")
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    full_name = models.CharField(max_length=120)
    phone = models.CharField("Телефон (только цифры)", max_length=20, unique=True)
    email = models.EmailField("Email (в нижнем регистре)", unique=True)
    # Student: the course they said they want. Teacher: what they teach.
    note = models.CharField(max_length=120, blank=True)
    # Students are approved at once. Teachers wait until staff tick this box.
    approved = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["full_name"]

    def __str__(self):
        return f"{self.full_name} ({self.get_role_display()})"


class Group(models.Model):
    title = models.CharField("Название", max_length=120)
    teacher = models.ForeignKey(
        Profile, on_delete=models.SET_NULL, null=True, blank=True, related_name="teaching_groups",
        limit_choices_to={"role": "teacher"},
    )
    lessons_total = models.PositiveSmallIntegerField("Всего уроков", default=24)
    lessons_done = models.PositiveSmallIntegerField("Проведено уроков", default=0)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["title"]

    def __str__(self):
        return self.title


class Enrollment(models.Model):
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="enrollments")
    student = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name="enrollments", limit_choices_to={"role": "student"})

    class Meta:
        constraints = [models.UniqueConstraint(fields=["group", "student"], name="portal_one_enrollment_per_group")]

    def __str__(self):
        return f"{self.student} → {self.group}"


class Lesson(models.Model):
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="lessons")
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()

    class Meta:
        ordering = ["starts_at"]

    def __str__(self):
        return f"{self.group} {self.starts_at:%d.%m %H:%M}"


class Assignment(models.Model):
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="assignments")
    title = models.CharField(max_length=160)
    instructions = models.TextField(blank=True)
    due_date = models.DateField()
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["due_date", "id"]

    def __str__(self):
        return self.title


class Submission(models.Model):
    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE, related_name="submissions")
    student = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name="submissions")
    text = models.TextField()
    status = models.CharField(max_length=10, choices=SUBMISSION_STATUS_CHOICES, default="submitted")
    grade = models.CharField("Оценка", max_length=20, blank=True)
    feedback = models.TextField(blank=True)
    submitted_at = models.DateTimeField(default=timezone.now)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["submitted_at"]
        constraints = [models.UniqueConstraint(fields=["assignment", "student"], name="portal_one_submission_per_task")]

    def __str__(self):
        return f"{self.student} / {self.assignment}"


class Book(models.Model):
    """A book or file is a link (Google Drive, YouTube, publisher site, ...).

    Files are not uploaded: Vercel functions have no disk and a small request limit.
    """
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="books")
    title = models.CharField(max_length=160)
    kind = models.CharField(max_length=5, choices=BOOK_KIND_CHOICES, default="pdf")
    url = models.URLField(max_length=500)
    added_by = models.ForeignKey(Profile, on_delete=models.SET_NULL, null=True, blank=True, related_name="books")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at", "id"]

    def __str__(self):
        return self.title
