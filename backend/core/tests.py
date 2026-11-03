from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import ExamRegistration, GalleryPhoto, MockExam, News, StaffRole, TrialRegistration


def make_exam(**kw):
    defaults = dict(
        title="IELTS Mock #1",
        exam_date=timezone.now() + timedelta(days=7),
        max_seats=2,
        status="upcoming",
    )
    defaults.update(kw)
    return MockExam.objects.create(**defaults)


def reg_payload(exam, **kw):
    data = dict(exam_id=exam.id, full_name="Ali Valiev", phone="+998901234567")
    data.update(kw)
    return data


class PublicApiTests(APITestCase):
    def setUp(self):
        cache.clear()

    def test_mock_exam_list_only_open_sessions_and_counts_seats(self):
        exam = make_exam()
        make_exam(title="Cancelled", status="cancelled")
        make_exam(title="In progress", status="in_progress")
        make_exam(title="Completed", status="completed")
        make_exam(title="Past", exam_date=timezone.now() - timedelta(hours=1))
        ExamRegistration.objects.create(exam=exam, full_name="A", phone="1")

        res = self.client.get("/api/mock-exams/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual([e["title"] for e in res.data], ["IELTS Mock #1"])
        self.assertEqual(res.data[0]["registered"], 1)
        self.assertEqual(res.data[0]["seats_left"], 1)

    def test_trial_registration(self):
        res = self.client.post(
            "/api/trial-registrations/",
            {"full_name": "Ali", "phone": "+998901234567", "course": "ielts"},
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(TrialRegistration.objects.get().status, "new")

    def test_trial_registration_rejects_unknown_course(self):
        res = self.client.post(
            "/api/trial-registrations/",
            {"full_name": "Ali", "phone": "1", "course": "hacking"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_exam_registration_payment_is_set_by_server(self):
        exam = make_exam(price_uzs=150000)
        res = self.client.post(
            "/api/exam-registrations/",
            reg_payload(exam, payment_method="click", payment_status="verified", amount_paid=1),
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        reg = ExamRegistration.objects.get()
        self.assertEqual(reg.payment_status, "pending")
        self.assertIsNone(reg.amount_paid)
        self.assertEqual(reg.amount_due, 150000)
        self.assertEqual(reg.payment_method, "click")

    def test_amount_due_uses_exam_price(self):
        exam = make_exam(price_uzs=120000)
        res = self.client.post("/api/exam-registrations/", reg_payload(exam), format="json")
        self.assertEqual(res.data["amount_due"], 120000)
        self.assertIsNone(res.data["amount_paid"])
        self.assertEqual(self.client.get("/api/mock-exams/").data[0]["price_uzs"], 120000)

    def test_format_saved_and_ticket_no_made_by_database(self):
        exam = make_exam()
        res = self.client.post(
            "/api/exam-registrations/",
            reg_payload(exam, format="computer", ticket_no="FAKE-1"),
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        reg = ExamRegistration.objects.get()
        self.assertEqual(reg.format, "computer")
        self.assertRegex(res.data["ticket_no"], r"^ST-\d{4}-MOCK-\d{4,}$")
        self.assertTrue(res.data["ticket_no"].endswith("-MOCK-" + str(reg.id).zfill(4)))
        self.assertEqual(reg.ticket_no, res.data["ticket_no"])

    def test_format_must_be_paper_or_computer(self):
        exam = make_exam()
        res = self.client.post("/api/exam-registrations/", reg_payload(exam, format="tablet"), format="json")
        self.assertEqual(res.status_code, 400)

    def test_exam_full(self):
        exam = make_exam(max_seats=1)
        self.assertEqual(self.client.post("/api/exam-registrations/", reg_payload(exam), format="json").status_code, 201)
        res = self.client.post("/api/exam-registrations/", reg_payload(exam), format="json")
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["code"], "EXAM_FULL")
        self.assertEqual(ExamRegistration.objects.count(), 1)

    def test_exam_closed_when_not_upcoming_or_in_past(self):
        for exam in [
            make_exam(status="completed"),
            make_exam(exam_date=timezone.now() - timedelta(hours=1)),
        ]:
            res = self.client.post("/api/exam-registrations/", reg_payload(exam), format="json")
            self.assertEqual(res.status_code, 409)
            self.assertEqual(res.data["code"], "EXAM_CLOSED")

    def test_exam_registration_requires_valid_exam(self):
        res = self.client.post(
            "/api/exam-registrations/",
            {"exam_id": 999, "full_name": "A", "phone": "1"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_public_cannot_use_admin_endpoints(self):
        for url in ["/api/admin/dashboard/", "/api/admin/exams/", "/api/admin/students/", "/api/admin/news/"]:
            self.assertEqual(self.client.get(url).status_code, 403, url)


class AdminApiTests(APITestCase):
    def setUp(self):
        cache.clear()
        User = get_user_model()
        self.owner = User.objects.create_user("owner@stanford.uz", "owner@stanford.uz", "pw-owner-123")
        self.editor = User.objects.create_user("editor@stanford.uz", "editor@stanford.uz", "pw-editor-123")
        self.stranger = User.objects.create_user("x@stanford.uz", "x@stanford.uz", "pw-x-123")
        StaffRole.objects.create(email="owner@stanford.uz", role="owner")
        StaffRole.objects.create(email="editor@stanford.uz", role="editor")

    def login(self, email, password):
        return self.client.post("/api/auth/login/", {"email": email, "password": password}, format="json")

    def test_login_and_me(self):
        res = self.login("Owner@Stanford.uz", "pw-owner-123")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["role"], "owner")
        self.assertEqual(self.client.get("/api/auth/me/").data["role"], "owner")

    def test_wrong_password(self):
        self.assertEqual(self.login("owner@stanford.uz", "nope").status_code, 400)

    def test_user_not_in_staff_roles_is_refused(self):
        res = self.login("x@stanford.uz", "pw-x-123")
        self.assertEqual(res.status_code, 403)
        self.assertFalse(self.client.get("/api/auth/me/").data["authenticated"])

    def test_logout(self):
        self.login("owner@stanford.uz", "pw-owner-123")
        self.client.post("/api/auth/logout/")
        self.assertFalse(self.client.get("/api/auth/me/").data["authenticated"])

    def test_exam_crud_and_owner_only_delete(self):
        self.login("editor@stanford.uz", "pw-editor-123")
        res = self.client.post("/api/admin/exams/", {
            "title": "Mock #5", "course_type": "ielts",
            "exam_date": (timezone.now() + timedelta(days=3)).isoformat(),
            "duration_minutes": 180, "max_seats": 20, "status": "upcoming",
        }, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        exam_id = res.data["id"]
        self.assertEqual(MockExam.objects.get().created_by, "editor@stanford.uz")

        res = self.client.patch(f"/api/admin/exams/{exam_id}/", {"max_seats": 25}, format="json")
        self.assertEqual(res.data["max_seats"], 25)

        res = self.client.patch(f"/api/admin/exams/{exam_id}/", {"price_uzs": 175000, "location": "Room 2, Nukus"}, format="json")
        self.assertEqual((res.data["price_uzs"], res.data["location"]), (175000, "Room 2, Nukus"))
        public = self.client.get("/api/mock-exams/").data[0]
        self.assertEqual((public["price_uzs"], public["location"]), (175000, "Room 2, Nukus"))
        res = self.client.patch(f"/api/admin/exams/{exam_id}/", {"price_uzs": -1}, format="json")
        self.assertEqual(res.status_code, 400)

        self.assertEqual(self.client.delete(f"/api/admin/exams/{exam_id}/").status_code, 403)

        self.client.post("/api/auth/logout/")
        self.login("owner@stanford.uz", "pw-owner-123")
        ExamRegistration.objects.create(exam_id=exam_id, full_name="A", phone="1")
        self.assertEqual(self.client.delete(f"/api/admin/exams/{exam_id}/").status_code, 204)
        self.assertEqual(ExamRegistration.objects.count(), 0)

    def test_verify_payment(self):
        exam = make_exam()
        reg = ExamRegistration.objects.create(exam=exam, full_name="A", phone="1", amount_due=150000)
        self.login("editor@stanford.uz", "pw-editor-123")
        res = self.client.get(f"/api/admin/exams/{exam.id}/registrations/")
        self.assertEqual(len(res.data), 1)
        res = self.client.patch(f"/api/admin/exam-registrations/{reg.id}/", {"payment_status": "verified", "full_name": "Changed"}, format="json")
        self.assertEqual(res.status_code, 200)
        reg.refresh_from_db()
        self.assertEqual(reg.payment_status, "verified")
        self.assertEqual(reg.amount_paid, 150000)  # set only when staff confirm
        self.assertEqual(reg.full_name, "A")  # read-only for admins

        self.client.patch(f"/api/admin/exam-registrations/{reg.id}/", {"payment_status": "pending"}, format="json")
        reg.refresh_from_db()
        self.assertIsNone(reg.amount_paid)

        res = self.client.patch(f"/api/admin/exam-registrations/{reg.id}/", {"payment_status": "paid"}, format="json")
        self.assertEqual(res.status_code, 400)  # "paid" is no longer a valid status

    def test_students_filter_and_status(self):
        s = TrialRegistration.objects.create(full_name="A", phone="1", course="ielts")
        TrialRegistration.objects.create(full_name="B", phone="2", course="kids")
        self.login("editor@stanford.uz", "pw-editor-123")
        self.assertEqual(len(self.client.get("/api/admin/students/?course=ielts").data), 1)
        self.client.patch(f"/api/admin/students/{s.id}/", {"status": "contacted"}, format="json")
        s.refresh_from_db()
        self.assertEqual(s.status, "contacted")

    def test_news(self):
        self.login("editor@stanford.uz", "pw-editor-123")
        res = self.client.post("/api/admin/news/", {"title": "Intake open", "body": "..."}, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(self.client.get("/api/news/").data[0]["title"], "Intake open")
        self.assertEqual(self.client.delete(f"/api/admin/news/{res.data['id']}/").status_code, 403)
        self.assertEqual(News.objects.count(), 1)

    def test_dashboard(self):
        make_exam()
        TrialRegistration.objects.create(full_name="A", phone="1", course="ielts")
        self.login("owner@stanford.uz", "pw-owner-123")
        data = self.client.get("/api/admin/dashboard/").data
        self.assertEqual(data["upcoming_exams"], 1)
        self.assertEqual(data["new_students"], 1)

    def test_admin_writes_require_csrf_token(self):
        client = self.client_class(enforce_csrf_checks=True)
        client.force_login(self.owner)
        res = client.post("/api/admin/news/", {"title": "x"}, format="json")
        self.assertEqual(res.status_code, 403)


def make_image_file(name="photo.jpg", size=(3000, 2000), fmt="JPEG", mode="RGB", exif_gps=False):
    import io

    from django.core.files.uploadedfile import SimpleUploadedFile
    from PIL import Image

    img = Image.new(mode, size, (200, 30, 30) if mode == "RGB" else (200, 30, 30, 128))
    buf = io.BytesIO()
    kwargs = {}
    if exif_gps:
        exif = Image.Exif()
        exif[0x8825] = {1: "N", 2: (42.0, 27.0, 0.0)}  # GPSInfo
        kwargs["exif"] = exif
    img.save(buf, format=fmt, **kwargs)
    return SimpleUploadedFile(name, buf.getvalue(), content_type=f"image/{fmt.lower()}")


class GalleryTests(APITestCase):
    def setUp(self):
        cache.clear()
        User = get_user_model()
        User.objects.create_user("owner@stanford.uz", "owner@stanford.uz", "pw-owner-123")
        User.objects.create_user("editor@stanford.uz", "editor@stanford.uz", "pw-editor-123")
        StaffRole.objects.create(email="owner@stanford.uz", role="owner")
        StaffRole.objects.create(email="editor@stanford.uz", role="editor")

    def login(self, who="editor"):
        self.client.post("/api/auth/login/", {"email": f"{who}@stanford.uz", "password": f"pw-{who}-123"}, format="json")

    def upload(self, **kw):
        return self.client.post("/api/admin/gallery/", {"image": make_image_file(**kw), "caption": "Класс", "size": "wide"}, format="multipart")

    def test_public_cannot_upload(self):
        self.assertEqual(self.upload().status_code, 403)

    def test_upload_resizes_and_strips_metadata(self):
        from PIL import Image
        import io
        self.login()
        res = self.upload(exif_gps=True)
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual((res.data["width"], res.data["height"]), (1600, 1067))
        self.assertEqual(res.data["size"], "wide")

        listing = self.client.get("/api/gallery/").data
        self.assertEqual(len(listing), 1)
        img_res = self.client.get(listing[0]["url"])
        self.assertEqual(img_res.status_code, 200)
        self.assertEqual(img_res["Content-Type"], "image/jpeg")
        self.assertIn("immutable", img_res["Cache-Control"])
        img = Image.open(io.BytesIO(img_res.content))
        self.assertEqual(img.format, "JPEG")
        self.assertNotIn(0x8825, img.getexif())  # GPS removed

    def test_png_with_transparency_is_converted(self):
        self.login()
        res = self.upload(name="logo.png", fmt="PNG", mode="RGBA", size=(400, 300))
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["width"], 400)

    def test_rejects_non_image(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        self.login()
        res = self.client.post("/api/admin/gallery/", {"image": SimpleUploadedFile("x.jpg", b"not an image")}, format="multipart")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(GalleryPhoto.objects.count(), 0)

    def test_order_edit_and_owner_only_delete(self):
        self.login()
        ids = [self.upload(size=(100, 100)).data["id"] for _ in range(3)]
        self.assertEqual([p["id"] for p in self.client.get("/api/gallery/").data], ids)

        res = self.client.post("/api/admin/gallery/reorder/", {"ids": [ids[2], ids[0], ids[1]]}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual([p["id"] for p in self.client.get("/api/gallery/").data], [ids[2], ids[0], ids[1]])

        res = self.client.patch(f"/api/admin/gallery/{ids[0]}/", {"caption": "Новая подпись", "size": "tall"}, format="json")
        self.assertEqual(res.data["caption"], "Новая подпись")

        self.assertEqual(self.client.delete(f"/api/admin/gallery/{ids[0]}/").status_code, 403)
        self.client.post("/api/auth/logout/")
        self.login("owner")
        self.assertEqual(self.client.delete(f"/api/admin/gallery/{ids[0]}/").status_code, 204)
        self.assertEqual(GalleryPhoto.objects.count(), 2)

    def test_replace_photo_changes_url(self):
        self.login()
        photo = self.upload(size=(100, 100)).data
        import time; time.sleep(1.1)
        res = self.client.patch(f"/api/admin/gallery/{photo['id']}/", {"image": make_image_file(size=(50, 80))}, format="multipart")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual((res.data["width"], res.data["height"]), (50, 80))
        self.assertNotEqual(res.data["url"], photo["url"])

    def test_missing_image_404(self):
        self.assertEqual(self.client.get("/api/gallery/999/image/").status_code, 404)
