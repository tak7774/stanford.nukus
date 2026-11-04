"""Staff manage the portal in Django's admin (/api/django-admin/): approve teachers,
create groups, enroll students, add lessons."""
from django.contrib import admin

from .models import Assignment, Book, Enrollment, Group, Lesson, Profile, Submission


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ["full_name", "role", "phone", "email", "note", "approved", "created_at"]
    list_filter = ["role", "approved"]
    list_editable = ["approved"]
    search_fields = ["full_name", "phone", "email"]
    readonly_fields = ["user"]


class EnrollmentInline(admin.TabularInline):
    model = Enrollment
    extra = 1
    autocomplete_fields = ["student"]


class LessonInline(admin.TabularInline):
    model = Lesson
    extra = 1


@admin.register(Group)
class GroupAdmin(admin.ModelAdmin):
    list_display = ["title", "teacher", "lessons_done", "lessons_total", "active"]
    list_filter = ["active"]
    autocomplete_fields = ["teacher"]
    inlines = [EnrollmentInline, LessonInline]


@admin.register(Assignment)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = ["title", "group", "due_date"]
    list_filter = ["group"]


@admin.register(Submission)
class SubmissionAdmin(admin.ModelAdmin):
    list_display = ["assignment", "student", "status", "grade", "submitted_at"]
    list_filter = ["status"]


@admin.register(Book)
class BookAdmin(admin.ModelAdmin):
    list_display = ["title", "kind", "group", "created_at"]
    list_filter = ["group", "kind"]
