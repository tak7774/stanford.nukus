from rest_framework.permissions import BasePermission

from .models import StaffRole


def get_role(user):
    """Return 'owner', 'editor' or None for a logged-in Django user.

    Same rule as the old admin.js: the user's email must be listed in the
    staff_roles table. A Django superuser counts as owner even without a row.
    """
    if not user or not user.is_authenticated or not user.is_active:
        return None
    email = (user.email or user.username or "").strip().lower()
    row = StaffRole.objects.filter(email__iexact=email).first()
    if row:
        return row.role
    if user.is_superuser:
        return "owner"
    return None


class IsStaffMember(BasePermission):
    """Logged in and listed in staff_roles. Deleting requires the owner role."""

    message = "Staff login required."

    def has_permission(self, request, view):
        role = get_role(request.user)
        if role is None:
            return False
        if request.method == "DELETE":
            self.message = "Only the owner can delete."
            return role == "owner"
        return True

