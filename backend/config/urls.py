from django.conf import settings
from django.contrib import admin
from django.http import FileResponse, Http404
from django.urls import include, path, re_path

urlpatterns = [
    path("api/", include("core.urls")),
    # Django's built-in admin: a backup tool for fixing data and managing logins.
    path("api/django-admin/", admin.site.urls),
]

if settings.DEBUG:
    # Local testing only: serve index.html, mock.html, admin.html and their JS
    # from the repo folder, so the site and the API run together at
    # http://127.0.0.1:8000/ . On Vercel these files are served by Vercel itself.
    SITE_FILE_TYPES = {".html", ".js", ".css", ".png", ".jpg", ".jpeg", ".svg", ".ico", ".webp"}

    def site_file(request, name="index.html"):
        file = (settings.REPO_ROOT / name).resolve()
        if file.parent != settings.REPO_ROOT.resolve() or file.suffix.lower() not in SITE_FILE_TYPES or not file.is_file():
            raise Http404
        return FileResponse(open(file, "rb"))

    urlpatterns += [
        path("", site_file),
        re_path(r"^(?P<name>[\w.\-]+)$", site_file),
    ]
