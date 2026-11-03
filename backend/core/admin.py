"""Django's built-in admin at /api/django-admin/ — a backup tool next to admin.html."""
from django.contrib import admin

from django.utils.html import format_html

from .models import ExamRegistration, GalleryPhoto, MockExam, News, StaffRole, TrialRegistration


@admin.register(StaffRole)
class StaffRoleAdmin(admin.ModelAdmin):
    list_display = ["email", "role", "created_at"]


@admin.register(News)
class NewsAdmin(admin.ModelAdmin):
    list_display = ["title", "created_at"]
    search_fields = ["title", "body"]


@admin.register(TrialRegistration)
class TrialRegistrationAdmin(admin.ModelAdmin):
    list_display = ["full_name", "phone", "course", "status", "created_at"]
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
    list_display = ["full_name", "phone", "exam", "payment_method", "payment_status", "registered_at"]
    list_filter = ["payment_status", "payment_method", "exam"]
    search_fields = ["full_name", "phone"]


@admin.register(GalleryPhoto)
class GalleryPhotoAdmin(admin.ModelAdmin):
    list_display = ["thumb", "caption", "size", "position", "created_at"]
    list_editable = ["caption", "size", "position"]
    fields = ["thumb", "caption", "size", "position"]
    readonly_fields = ["thumb"]

    def get_queryset(self, request):
        return super().get_queryset(request).defer("image")

    def has_add_permission(self, request):
        return False  # upload photos from admin.html → Gallery

    @admin.display(description="Photo")
    def thumb(self, obj):
        if not obj.pk:
            return ""
        return format_html('<img src="{}" style="height:60px;border-radius:4px">', obj.url)
