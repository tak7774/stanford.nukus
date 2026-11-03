from datetime import timedelta
from decimal import Decimal
from pathlib import Path
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import (
    ExamRegistration,
    GalleryPhoto,
    MockExam,
    News,
    StaffRole,
    StudentResult,
    Teacher,
    TrialRegistration,
    ielts_overall,
)


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

    def test_format_always_computer_and_ticket_no_made_by_database(self):
        exam = make_exam()
        res = self.client.post(
            "/api/exam-registrations/",
            reg_payload(exam, format="paper", ticket_no="FAKE-1", birth_date="2000-01-01"),
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        reg = ExamRegistration.objects.get()
        self.assertEqual(reg.format, "computer")  # all mocks are CD, whatever is sent
        self.assertIsNone(reg.birth_date)  # date of birth is no longer saved
        self.assertNotIn("birth_date", res.data)
        self.assertRegex(res.data["ticket_no"], r"^ST-\d{4}-MOCK-\d{4,}$")
        self.assertTrue(res.data["ticket_no"].endswith("-MOCK-" + str(reg.id).zfill(4)))
        self.assertEqual(reg.ticket_no, res.data["ticket_no"])

    def test_public_mock_list_has_no_format(self):
        make_exam()
        self.assertNotIn("exam_format", self.client.get("/api/mock-exams/").data[0])

    def test_unknown_payment_method_rejected(self):
        exam = make_exam()
        res = self.client.post("/api/exam-registrations/", reg_payload(exam, payment_method="bitcoin"), format="json")
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


class OverallRoundingTests(APITestCase):
    def test_ielts_rounding(self):
        cases = [
            ((6.5, 6.5, 5.0, 7.0), "6.5"),   # 6.25 -> 6.5
            ((7, 7, 6.5, 6.5), "7.0"),       # 6.75 -> 7.0
            ((6, 6, 6, 6.5), "6.0"),         # 6.125 -> 6.0
            ((6, 6.5, 6.5, 6.5), "6.5"),     # 6.375 -> 6.5
            ((8.5, 8.5, 8.5, 8.0), "8.5"),   # 8.375 -> 8.5
            ((9, 9, 9, 9), "9.0"),
            ((0, 0, 0, 0), "0.0"),
        ]
        for bands, expected in cases:
            self.assertEqual(ielts_overall(*bands), Decimal(expected), bands)
        self.assertIsNone(ielts_overall(7, 7, None, 7))


class LeadFormTests(APITestCase):
    def setUp(self):
        cache.clear()

    def test_course_card_lead(self):
        res = self.client.post("/api/trial-registrations/", {
            "full_name": "Ali", "phone": "+998 90 123-45-67", "course": "ielts", "source": "course_card",
        }, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        lead = TrialRegistration.objects.get()
        self.assertEqual((lead.source, lead.preferred_time, lead.comment), ("course_card", None, None))

    def test_apply_form_lead_with_unsure_course(self):
        res = self.client.post("/api/trial-registrations/", {
            "full_name": "Ali", "phone": "+998901234567", "course": "unsure",
            "source": "apply_form", "preferred_time": "evening", "comment": "After work",
        }, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        lead = TrialRegistration.objects.get()
        self.assertEqual((lead.course, lead.preferred_time, lead.comment), ("unsure", "evening", "After work"))
        self.assertIsNone(lead.staff_note)

    def test_lead_validation(self):
        bad = [
            {"full_name": "A", "phone": "+998901234567", "course": "ielts", "source": "spam"},
            {"full_name": "A", "phone": "+998901234567", "course": "ielts", "preferred_time": "night"},
            {"full_name": "A", "phone": "123", "course": "ielts"},
            {"full_name": "A", "phone": "+998901234567", "course": "ielts", "staff_note": "x", "status": "enrolled"},
        ]
        for data in bad[:3]:
            self.assertEqual(self.client.post("/api/trial-registrations/", data, format="json").status_code, 400, data)
        # staff_note and status cannot be set by visitors (ignored)
        self.assertEqual(self.client.post("/api/trial-registrations/", bad[3], format="json").status_code, 201)
        lead = TrialRegistration.objects.get()
        self.assertEqual((lead.status, lead.staff_note), ("new", None))


class TelegramTests(APITestCase):
    def setUp(self):
        cache.clear()

    @mock.patch.dict("os.environ", {"TELEGRAM_BOT_TOKEN": "", "TELEGRAM_CHAT_ID": ""})
    def test_no_env_vars_sends_nothing(self):
        with mock.patch("core.telegram.urllib.request.urlopen") as urlopen:
            with self.captureOnCommitCallbacks(execute=True):
                res = self.client.post("/api/trial-registrations/", {"full_name": "Ali", "phone": "+998901234567", "course": "ielts"}, format="json")
        self.assertEqual(res.status_code, 201)
        urlopen.assert_not_called()

    @mock.patch.dict("os.environ", {"TELEGRAM_BOT_TOKEN": "123:abc", "TELEGRAM_CHAT_ID": "-100"})
    def test_lead_message_sent(self):
        with mock.patch("core.telegram.urllib.request.urlopen") as urlopen:
            urlopen.return_value.__enter__.return_value.status = 200
            with self.captureOnCommitCallbacks(execute=True):
                self.client.post("/api/trial-registrations/", {
                    "full_name": "Ali Valiev", "phone": "+998901234567", "course": "unsure",
                    "source": "apply_form", "preferred_time": "morning",
                }, format="json")
        urlopen.assert_called_once()
        req = urlopen.call_args[0][0]
        self.assertIn("api.telegram.org/bot123:abc/sendMessage", req.full_url)
        import json
        body = json.loads(req.data)
        self.assertEqual(body["chat_id"], "-100")
        for part in ["Ali Valiev", "+998901234567", "помочь выбрать", "Оставить заявку", "утро"]:
            self.assertIn(part, body["text"])

    @mock.patch.dict("os.environ", {"TELEGRAM_BOT_TOKEN": "123:abc", "TELEGRAM_CHAT_ID": "-100"})
    def test_telegram_failure_does_not_break_registration(self):
        exam = make_exam()
        with mock.patch("core.telegram.urllib.request.urlopen", side_effect=OSError("down")) as urlopen:
            with self.captureOnCommitCallbacks(execute=True):
                res = self.client.post("/api/exam-registrations/", reg_payload(exam, payment_method="cash"), format="json")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(ExamRegistration.objects.count(), 1)
        urlopen.assert_called_once()
        import json
        text = json.loads(urlopen.call_args[0][0].data)["text"]
        self.assertIn(res.data["ticket_no"], text)
        self.assertIn("IELTS Mock #1", text)


class MockResultLookupTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.exam = make_exam()
        self.reg = ExamRegistration.objects.create(
            exam=self.exam, full_name="Ali Valiev", first_name="Ali", phone="+998 90 123-45-67"
        )
        self.reg.refresh_from_db()

    def lookup(self, ticket, phone):
        return self.client.post("/api/mock-results/lookup/", {"ticket_no": ticket, "phone": phone}, format="json")

    def test_needs_both_ticket_and_phone(self):
        self.assertEqual(self.lookup(self.reg.ticket_no, "").status_code, 400)
        self.assertEqual(self.lookup("", "+998901234567").status_code, 400)
        res = self.lookup(self.reg.ticket_no, "+998 99 999-99-99")
        self.assertEqual((res.status_code, res.data["code"]), (404, "NOT_FOUND"))
        self.assertEqual(self.lookup("ST-2026-MOCK-9999", "+998901234567").status_code, 404)

    def test_not_ready_then_ready(self):
        res = self.lookup(self.reg.ticket_no.lower(), "901234567")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["ready"])
        self.assertNotIn("overall", res.data)

        self.reg.listening, self.reg.reading, self.reg.writing, self.reg.speaking = 7, 6.5, 6, 6.5
        self.reg.save()
        res = self.lookup(self.reg.ticket_no, "+998901234567")
        self.assertTrue(res.data["ready"])
        self.assertEqual(res.data["overall"], 6.5)  # 6.5 average
        self.assertEqual(res.data["listening"], 7.0)
        self.assertEqual(res.data["first_name"], "Ali")
        self.assertNotIn("phone", res.data)

    def test_rate_limited(self):
        codes = [self.lookup("ST-X", "+998901234567").status_code for _ in range(11)]
        self.assertEqual(codes[-1], 429)


class StaffMixin:
    def make_staff(self):
        cache.clear()
        User = get_user_model()
        User.objects.create_user("owner@stanford.uz", "owner@stanford.uz", "pw-owner-123")
        User.objects.create_user("editor@stanford.uz", "editor@stanford.uz", "pw-editor-123")
        StaffRole.objects.create(email="owner@stanford.uz", role="owner")
        StaffRole.objects.create(email="editor@stanford.uz", role="editor")

    def login(self, who="editor"):
        self.client.post("/api/auth/login/", {"email": f"{who}@stanford.uz", "password": f"pw-{who}-123"}, format="json")


class AdminScoresAndNotesTests(StaffMixin, APITestCase):
    def setUp(self):
        self.make_staff()

    def test_enter_mock_scores_and_attendance(self):
        exam = make_exam()
        reg = ExamRegistration.objects.create(exam=exam, full_name="A", phone="1")
        self.login()
        res = self.client.patch(f"/api/admin/exam-registrations/{reg.id}/", {
            "listening": 7.5, "reading": 7, "writing": 6, "speaking": 6.5, "attended": True, "overall": 9,
        }, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["overall"], 7.0)  # 6.75 -> 7.0, the sent overall is ignored
        self.assertTrue(res.data["attended"])
        res = self.client.patch(f"/api/admin/exam-registrations/{reg.id}/", {"reading": 7.3}, format="json")
        self.assertEqual(res.status_code, 400)
        res = self.client.patch(f"/api/admin/exam-registrations/{reg.id}/", {"reading": 9.5}, format="json")
        self.assertEqual(res.status_code, 400)
        res = self.client.patch(f"/api/admin/exam-registrations/{reg.id}/", {"writing": None}, format="json")
        self.assertIsNone(res.data["overall"])  # a band removed -> no overall
        # payment untouched by score edits
        reg.refresh_from_db()
        self.assertEqual(reg.payment_status, "pending")

    def test_staff_note_and_lead_fields_in_students(self):
        lead = TrialRegistration.objects.create(
            full_name="A", phone="1", course="unsure", source="apply_form", preferred_time="day", comment="Hi"
        )
        self.login()
        row = self.client.get("/api/admin/students/").data[0]
        self.assertEqual((row["source"], row["preferred_time"], row["comment"]), ("apply_form", "day", "Hi"))
        res = self.client.patch(f"/api/admin/students/{lead.id}/", {"staff_note": "Called, wants evening", "comment": "changed"}, format="json")
        self.assertEqual(res.status_code, 200)
        lead.refresh_from_db()
        self.assertEqual((lead.staff_note, lead.comment), ("Called, wants evening", "Hi"))


class StudentResultTests(StaffMixin, APITestCase):
    def setUp(self):
        self.make_staff()

    def create(self, **kw):
        data = {"first_name": "Aziz", "last_name_initial": "j.", "listening": "8", "reading": "7.5",
                "writing": "6.5", "speaking": "7", "course": "ielts", "exam_date": "2026-10-01"}
        data.update(kw)
        return self.client.post("/api/admin/results/", data, format="multipart")

    def test_public_only_sees_published_in_order(self):
        self.assertEqual(self.create().status_code, 403)  # not logged in
        self.login()
        a = self.create(image=make_image_file(size=(900, 1600)))
        self.assertEqual(a.status_code, 201, a.data)
        self.assertEqual(a.data["overall"], 7.5)  # 7.25 -> 7.5
        self.assertEqual(a.data["last_name_initial"], "J")
        self.assertFalse(a.data["is_published"])
        b = self.create(first_name="Malika", exam_date="")
        self.assertIsNone(b.data["image_url"])
        self.assertIsNone(b.data["exam_date"])

        self.client.post("/api/auth/logout/")
        self.assertEqual(self.client.get("/api/results/").data, [])
        self.assertEqual(self.client.get(a.data["image_url"]).status_code, 404)  # unpublished photo hidden

        self.login()
        for r in (a, b):
            self.client.patch(f"/api/admin/results/{r.data['id']}/", {"is_published": True}, format="json")
        self.client.post("/api/admin/results/reorder/", {"ids": [b.data["id"], a.data["id"]]}, format="json")
        self.client.post("/api/auth/logout/")
        public = self.client.get("/api/results/").data
        self.assertEqual([r["first_name"] for r in public], ["Malika", "Aziz"])
        self.assertEqual(public[1]["overall"], 7.5)
        img = self.client.get(public[1]["image_url"])
        self.assertEqual((img.status_code, img["Content-Type"]), (200, "image/jpeg"))

    def test_validation_and_owner_delete(self):
        self.login()
        self.assertEqual(self.create(listening="9.5").status_code, 400)
        self.assertEqual(self.create(reading="6.3").status_code, 400)
        self.assertEqual(self.create(first_name="").status_code, 400)
        rid = self.create(image=make_image_file(size=(100, 100))).data["id"]
        res = self.client.patch(f"/api/admin/results/{rid}/", {"remove_image": "1", "speaking": "9"}, format="multipart")
        self.assertIsNone(res.data["image_url"])
        self.assertEqual(res.data["overall"], 8.0)  # (8+7.5+6.5+9)/4 = 7.75 -> 8.0
        self.assertEqual(self.client.delete(f"/api/admin/results/{rid}/").status_code, 403)
        self.client.post("/api/auth/logout/")
        self.login("owner")
        self.assertEqual(self.client.delete(f"/api/admin/results/{rid}/").status_code, 204)
        self.assertEqual(StudentResult.objects.count(), 0)


class TeacherTests(StaffMixin, APITestCase):
    def setUp(self):
        self.make_staff()

    def test_crud_publish_and_photo(self):
        self.login()
        res = self.client.post("/api/admin/teachers/", {
            "name": "Teacher One", "role": "IELTS, Speaking", "ielts_band": "8.5",
            "experience_years": "6", "tags": "IELTS, Speaking, ", "image": make_image_file(size=(600, 800)),
        }, format="multipart")
        self.assertEqual(res.status_code, 201, res.data)
        tid = res.data["id"]
        self.assertEqual(self.client.get("/api/teachers/").data, [])  # not published yet
        self.client.patch(f"/api/admin/teachers/{tid}/", {"is_published": "true", "ielts_band": ""}, format="multipart")
        public = self.client.get("/api/teachers/").data
        self.assertEqual(public[0]["tags"], ["IELTS", "Speaking"])
        self.assertIsNone(public[0]["ielts_band"])
        self.assertEqual(public[0]["experience_years"], 6)
        self.assertEqual(self.client.get(public[0]["image_url"]).status_code, 200)
        res = self.client.patch(f"/api/admin/teachers/{tid}/", {"experience_years": 99}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self.client.delete(f"/api/admin/teachers/{tid}/").status_code, 403)
        self.client.post("/api/auth/logout/")
        self.login("owner")
        self.assertEqual(self.client.delete(f"/api/admin/teachers/{tid}/").status_code, 204)
        self.assertEqual(Teacher.objects.count(), 0)


class SupabaseSqlFileTests(APITestCase):
    def test_sql_file_matches_migration(self):
        import importlib
        migration = importlib.import_module("core.migrations.0006_results_leads_teachers")
        sql_file = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "002_results_leads_teachers.sql"
        self.assertIn(migration.POSTGRES_SQL.strip(), sql_file.read_text(encoding="utf-8").replace("\r\n", "\n"))
