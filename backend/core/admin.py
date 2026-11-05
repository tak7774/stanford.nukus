"""Django's built-in admin at /api/django-admin/ — a backup tool next to admin.html."""
from django.contrib import admin

from django.utils.html import format_html

from .models import ExamRegistration, MockExam, News, PageView, StaffRole, StudentResult, Teacher, TrialRegistration


@admin.register(StaffRole)
class StaffRoleAdmin(admin.ModelAdmin):
    list_display = ["email", "role", "created_at"]


@admin.register(News)
class NewsAdmin(admin.ModelAdmin):
    list_display = ["title", "kind", "event_date", "is_published", "created_at"]
    list_filter = ["kind", "is_published"]
    search_fields = ["title", "body"]
    exclude = ["image", "content_type", "width", "height"]  # upload photos from admin.html -> News


@admin.register(PageView)
class PageViewAdmin(admin.ModelAdmin):
    list_display = ["created_at", "path", "device", "referrer"]
    list_filter = ["path", "device"]


@admin.register(TrialRegistration)
class TrialRegistrationAdmin(admin.ModelAdmin):
    list_display = ["full_name", "phone", "course", "source", "preferred_time", "status", "created_at"]
    list_filter = ["status", "course"]
    search_fields = ["full_name", "phone"]


class ExamRegistrationInline(admin.TabularInline):
    model = ExamRegistration
    extra = 0
    fields = ["full_name", "phone", "payment_method", "payment_status"]


@admin.register(MockExam)
class MockExamAdmin(admin.ModelAdmin):
    list_display = ["title", "course_type", "exam_date", "price_uzs", "max_seats", "status"]
    list_filter = ["status", "course_type"]
    inlines = [ExamRegistrationInline]


@admin.register(ExamRegistration)
class ExamRegistrationAdmin(admin.ModelAdmin):
    list_display = ["full_name", "phone", "exam", "payment_method", "payment_status", "results_published_at", "registered_at"]
    list_filter = ["payment_status", "payment_method", "exam"]
    search_fields = ["full_name", "phone"]


@admin.register(StudentResult)
class StudentResultAdmin(admin.ModelAdmin):
    list_display = ["first_name", "last_name_initial", "overall", "course", "exam_date", "is_published", "position"]
    list_filter = ["is_published", "course"]
    exclude = ["image", "content_type", "width", "height"]  # upload photos from admin.html → Результаты


@admin.register(Teacher)
class TeacherAdmin(admin.ModelAdmin):
    list_display = ["name", "role", "ielts_band", "experience_years", "is_published", "position"]
    list_filter = ["is_published"]
    exclude = ["image", "content_type", "width", "height"]  # upload photos from admin.html → Преподаватели
