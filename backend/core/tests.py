from datetime import timedelta
from decimal import Decimal
from pathlib import Path
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APITestCase

from portal.models import Profile

from .models import (
    ExamRegistration,
    MockExam,
    News,
    PageView,
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
    data = dict(exam_id=exam.id, full_name="Ali Valiev", phone="+998901234567", password="Stanford-2026!")
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
        # scores are entered but not published yet: still hidden
        res = self.lookup(self.reg.ticket_no, "+998901234567")
        self.assertFalse(res.data["ready"])
        self.assertNotIn("overall", res.data)

        self.reg.results_published_at = timezone.now()
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


PW = "Stanford-2026!"


class StudentAccountOnRegistrationTests(APITestCase):
    """The mock form creates a portal account: phone + the password the student chose."""

    def setUp(self):
        cache.clear()

    def register(self, exam, **kw):
        return self.client.post("/api/exam-registrations/", reg_payload(exam, **kw), format="json")

    def test_account_created_with_hashed_password_and_never_echoed(self):
        exam = make_exam()
        res = self.register(exam)
        self.assertEqual(res.status_code, 201, res.data)
        self.assertNotIn("password", res.data)
        profile = Profile.objects.get(phone="998901234567")
        self.assertEqual(profile.role, "student")
        self.assertTrue(profile.approved)
        user = profile.user
        self.assertNotEqual(user.password, PW)
        self.assertTrue(user.password.startswith(("pbkdf2_", "argon2", "bcrypt", "scrypt")))
        self.assertTrue(user.check_password(PW))
        self.assertEqual(user.email, "")  # never matches staff_roles
        self.assertEqual(ExamRegistration.objects.get().student, profile)
        # nowhere in the registration row
        reg = ExamRegistration.objects.get()
        self.assertNotIn(PW, " ".join(str(getattr(reg, f.name)) for f in reg._meta.fields))

    def test_student_can_log_in_to_the_portal_with_phone_and_password(self):
        self.register(make_exam())
        res = self.client.post("/api/portal/login/", {"phone": "+998 90 123-45-67", "password": PW}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["role"], "student")

    def test_password_is_required_and_must_be_strong(self):
        exam = make_exam()
        data = reg_payload(exam)
        del data["password"]
        self.assertEqual(self.client.post("/api/exam-registrations/", data, format="json").status_code, 400)
        for weak in ["short1", "12345678", "password"]:
            res = self.register(exam, password=weak)
            self.assertEqual(res.status_code, 400, weak)
            self.assertIn("password", res.data)
        self.assertEqual(ExamRegistration.objects.count(), 0)
        self.assertEqual(Profile.objects.count(), 0)

    def test_gender_is_still_saved_and_no_passport_asked(self):
        self.register(make_exam(), gender="female", passport_id="AB123")
        reg = ExamRegistration.objects.get()
        self.assertEqual(reg.gender, "female")
        self.assertFalse(hasattr(reg, "passport_id"))

    def test_same_phone_needs_the_same_password(self):
        exam1, exam2 = make_exam(), make_exam(title="Mock #2")
        self.assertEqual(self.register(exam1).status_code, 201)
        res = self.register(exam2, password="Another-pass-77")
        self.assertEqual((res.status_code, res.data["code"]), (403, "ACCOUNT_EXISTS"))
        self.assertEqual(ExamRegistration.objects.count(), 1)
        self.assertTrue(Profile.objects.get().user.check_password(PW))  # password not changed
        # the right password works, and the phone stays unique
        self.assertEqual(self.register(exam2).status_code, 201)
        self.assertEqual(Profile.objects.count(), 1)
        self.assertEqual(Profile.objects.get().mock_registrations.count(), 2)

    def test_same_student_cannot_book_the_same_exam_twice(self):
        exam = make_exam(max_seats=5)
        self.register(exam)
        res = self.register(exam)
        self.assertEqual((res.status_code, res.data["code"]), (409, "ALREADY_REGISTERED"))

    def test_telegram_message_has_no_password(self):
        from . import telegram
        self.register(make_exam())
        self.assertNotIn(PW, telegram.exam_registration_text(ExamRegistration.objects.get()))


class StudentPanelMockTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.exam = make_exam(exam_date=timezone.now() - timedelta(days=1))
        self.exam.exam_date = timezone.now() + timedelta(days=1)  # registration needs an open exam
        self.exam.save()
        self.client.post("/api/exam-registrations/", reg_payload(self.exam), format="json")
        self.client.post("/api/exam-registrations/", reg_payload(self.exam, phone="+998939999999", full_name="Other Student"), format="json")
        MockExam.objects.filter(pk=self.exam.pk).update(exam_date=timezone.now() - timedelta(days=1))
        self.mine = ExamRegistration.objects.get(phone="+998901234567")
        for band in ("listening", "reading", "writing", "speaking"):
            setattr(self.mine, band, 7)
        self.mine.save()

    def login(self, phone="+998901234567"):
        self.client.post("/api/portal/login/", {"phone": phone, "password": PW}, format="json")

    def test_needs_student_login(self):
        self.assertEqual(self.client.get("/api/portal/mock/").status_code, 403)

    def test_scores_hidden_until_published_then_visible(self):
        self.login()
        res = self.client.get("/api/portal/mock/")
        self.assertEqual(res.status_code, 200)
        row = res.data["registrations"][0]
        self.assertEqual(row["ticket_no"], self.mine.ticket_no)
        self.assertIsNone(row["result"])  # entered but not published
        self.assertNotIn("7.0", str(res.data))

        self.mine.results_published_at = timezone.now()
        self.mine.save()
        row = self.client.get("/api/portal/mock/").data["registrations"][0]
        self.assertEqual(row["result"]["overall"], 7.0)

    def test_student_sees_only_their_own_registrations(self):
        self.login("+998939999999")
        rows = self.client.get("/api/portal/mock/").data["registrations"]
        self.assertEqual(len(rows), 1)
        self.assertNotEqual(rows[0]["ticket_no"], self.mine.ticket_no)


class MockBoardTests(StaffMixin, APITestCase):
    def setUp(self):
        self.make_staff()
        self.future = make_exam(title="Future", max_seats=9, exam_date=timezone.now() + timedelta(days=3))
        self.future2 = make_exam(title="Sooner", max_seats=9, exam_date=timezone.now() + timedelta(days=1))
        self.past = make_exam(title="Past", max_seats=9, exam_date=timezone.now() - timedelta(days=2))
        self.r_future = ExamRegistration.objects.create(exam=self.future, full_name="Zed Zulu", first_name="Zed", last_name="Zulu", phone="1")
        self.r_sooner = ExamRegistration.objects.create(exam=self.future2, full_name="Old Row", phone="2")  # no first/last name saved
        self.r_past = ExamRegistration.objects.create(exam=self.past, full_name="Ali Valiev", first_name="Ali", last_name="Valiev", phone="3")

    def board(self, tab):
        return self.client.get(f"/api/admin/mock-board/?tab={tab}")

    def test_staff_only(self):
        self.assertEqual(self.client.get("/api/admin/mock-board/").status_code, 403)

    def test_upcoming_sorted_by_date_with_name_surname_phone(self):
        self.login()
        res = self.board("upcoming")
        self.assertEqual([r["id"] for r in res.data["rows"]], [self.r_sooner.id, self.r_future.id])
        first = res.data["rows"][0]
        self.assertEqual((first["first_name"], first["last_name"]), ("Old", "Row"))  # split from full_name
        self.assertEqual(first["phone"], "2")
        self.assertEqual(res.data["counts"], {"upcoming": 2, "taken": 1, "completed": 0})
        self.assertNotIn("password", str(res.data).lower())

    def test_taken_tab_score_entry_with_official_rounding_and_publish(self):
        self.login("editor")
        self.assertEqual([r["id"] for r in self.board("taken").data["rows"]], [self.r_past.id])
        # publishing before scores are saved is refused
        self.assertEqual(self.client.post(f"/api/admin/exam-registrations/{self.r_past.id}/publish/").status_code, 400)
        # 6.5 + 6.5 + 6.0 + 6.0 = 25 / 4 = 6.25 -> 6.5 ; and 6.75 -> 7.0
        res = self.client.patch(f"/api/admin/exam-registrations/{self.r_past.id}/",
                                {"listening": 6.5, "reading": 6.5, "writing": 6, "speaking": 6}, format="json")
        self.assertEqual(res.data["overall"], 6.5)
        res = self.client.patch(f"/api/admin/exam-registrations/{self.r_past.id}/",
                                {"listening": 7, "reading": 7, "writing": 6.5, "speaking": 6.5}, format="json")
        self.assertEqual(res.data["overall"], 7.0)  # 6.75 -> 7.0
        # hidden from the student side until «Completed»
        self.assertIsNone(self.r_past.results_published_at)
        res = self.client.post(f"/api/admin/exam-registrations/{self.r_past.id}/publish/")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["results_published_by"], "editor@stanford.uz")
        self.assertIsNotNone(res.data["results_published_at"])
        counts = self.board("completed").data
        self.assertEqual(counts["counts"], {"upcoming": 2, "taken": 0, "completed": 1})
        self.assertEqual(counts["rows"][0]["results_published_by"], "editor@stanford.uz")

    def test_cannot_publish_before_the_exam_took_place(self):
        self.login()
        for band in ("listening", "reading", "writing", "speaking"):
            setattr(self.r_future, band, 6)
        self.r_future.save()
        res = self.client.post(f"/api/admin/exam-registrations/{self.r_future.id}/publish/")
        self.assertEqual(res.status_code, 400)

    def test_scores_locked_after_publish_and_only_owner_can_unpublish(self):
        self.login("editor")
        self.client.patch(f"/api/admin/exam-registrations/{self.r_past.id}/",
                          {"listening": 6, "reading": 6, "writing": 6, "speaking": 6}, format="json")
        self.client.post(f"/api/admin/exam-registrations/{self.r_past.id}/publish/")
        res = self.client.patch(f"/api/admin/exam-registrations/{self.r_past.id}/", {"reading": 9}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self.client.post(f"/api/admin/exam-registrations/{self.r_past.id}/unpublish/").status_code, 403)
        self.client.post("/api/auth/logout/")
        self.login("owner")
        self.assertEqual(self.client.post(f"/api/admin/exam-registrations/{self.r_past.id}/unpublish/").status_code, 200)
        self.assertEqual(self.board("taken").data["counts"]["taken"], 1)


class AnalyticsTests(StaffMixin, APITestCase):
    def setUp(self):
        self.make_staff()
        self.v1 = "11111111-1111-4111-8111-111111111111"
        self.v2 = "22222222-2222-4222-8222-222222222222"

    def hit(self, visitor, path="/", **kw):
        data = {"path": path, "visitor_id": visitor, "referrer": "", "device": "desktop"}
        data.update(kw)
        return self.client.post("/api/analytics/hit/", data, format="json")

    def test_anonymous_can_insert_but_not_read(self):
        self.assertEqual(self.hit(self.v1).status_code, 204)
        self.assertEqual(PageView.objects.count(), 1)
        self.assertEqual(self.client.get("/api/admin/analytics/").status_code, 403)
        self.assertEqual(self.client.get("/api/analytics/hit/").status_code, 405)

    def test_no_personal_data_is_stored(self):
        self.hit(self.v1)
        names = {f.name for f in PageView._meta.fields}
        self.assertEqual(names, {"id", "created_at", "path", "visitor_id", "referrer", "device"})

    def test_input_is_checked_and_referrer_reduced_to_host(self):
        self.assertEqual(self.hit("not-a-uuid").status_code, 400)
        self.assertEqual(self.hit(self.v1, path="/admin.html").status_code, 400)
        self.assertEqual(self.hit(self.v1, path="/mock.html?exam=3#x", referrer="https://www.google.com/search?q=secret", device="mobile").status_code, 204)
        view = PageView.objects.get()
        self.assertEqual((view.path, view.referrer, view.device), ("/mock.html", "google.com", "mobile"))
        self.hit(self.v1, referrer="http://testserver/index.html")
        self.assertEqual(PageView.objects.latest("id").referrer, "")  # our own site is not a referrer
        self.hit(self.v1, device="toaster")
        self.assertEqual(PageView.objects.latest("id").device, "desktop")

    def test_dashboard_numbers(self):
        self.hit(self.v1)
        self.hit(self.v1, path="/mock.html")
        self.hit(self.v2)
        old = PageView.objects.create(path="/", visitor_id=self.v2)
        PageView.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=10))
        exam = make_exam(max_seats=5)
        ExamRegistration.objects.create(exam=exam, full_name="A", phone="1")
        self.login("editor")  # every staff role may see it
        res = self.client.get("/api/admin/analytics/")
        self.assertEqual(res.status_code, 200)
        today, d7, d30 = (res.data["periods"][k] for k in ("today", "d7", "d30"))
        self.assertEqual((today["visitors"], today["views"], today["registrations"]), (2, 3, 1))
        self.assertEqual(today["conversion"], 50.0)  # 1 registration / 2 visitors
        self.assertEqual((d7["visitors"], d7["views"]), (2, 3))
        self.assertEqual((d30["visitors"], d30["views"]), (2, 4))  # the 10-day-old view counts in 30 days only
        pages = {p["path"]: p for p in res.data["pages"]["today"]}
        self.assertEqual((pages["/"]["views"], pages["/"]["visitors"], pages["/mock.html"]["views"]), (2, 2, 1))
        self.assertEqual(len(res.data["daily"]), 30)
        last = res.data["daily"][-1]
        self.assertEqual((last["visitors"], last["views"], last["registrations"]), (2, 3, 1))

    def test_conversion_is_none_without_visitors(self):
        self.login()
        self.assertIsNone(self.client.get("/api/admin/analytics/").data["periods"]["today"]["conversion"])


class NewsEventsTests(StaffMixin, APITestCase):
    def setUp(self):
        self.make_staff()

    def post(self, **fields):
        return self.client.post("/api/admin/news/", fields, format="multipart")

    def test_post_with_photo_kind_date_and_place(self):
        self.login()
        when = (timezone.now() + timedelta(days=2)).isoformat()
        res = self.post(title="Speaking club", body="Free talk", kind="speaking_club", event_date=when,
                        location="Room 2", image=make_image_file(size=(1200, 800)))
        self.assertEqual(res.status_code, 201, res.data)
        self.assertTrue(res.data["image_url"].startswith("/api/news/"))
        listing = self.client.get("/api/news/").data
        self.assertEqual((listing[0]["kind"], listing[0]["location"]), ("speaking_club", "Room 2"))
        img = self.client.get(listing[0]["image_url"])
        self.assertEqual((img.status_code, img["Content-Type"]), (200, "image/jpeg"))

    def test_many_events_upcoming_first_past_hidden_unpublished_hidden(self):
        self.login()
        now = timezone.now()
        self.post(title="Plain news")
        self.post(title="Later event", kind="event", event_date=(now + timedelta(days=9)).isoformat())
        self.post(title="Sooner club", kind="speaking_club", event_date=(now + timedelta(days=1)).isoformat())
        self.post(title="Finished event", kind="event", event_date=(now - timedelta(days=1)).isoformat())
        self.post(title="Draft", is_published="false")
        titles = [n["title"] for n in self.client.get("/api/news/").data]
        self.assertEqual(titles, ["Sooner club", "Later event", "Plain news"])
        self.assertEqual(len(self.client.get("/api/admin/news/").data), 5)  # staff still see everything

    def test_unpublished_photo_is_not_public(self):
        self.login()
        nid = self.post(title="Draft", is_published="false", image=make_image_file(size=(100, 100))).data["id"]
        self.client.post("/api/auth/logout/")
        self.assertEqual(self.client.get(f"/api/news/{nid}/image/").status_code, 404)

    def test_gallery_is_gone(self):
        self.assertEqual(self.client.get("/api/gallery/").status_code, 404)
        self.login()
        self.assertEqual(self.client.get("/api/admin/gallery/").status_code, 404)



class SupabaseSqlFileTests(APITestCase):
    def test_sql_file_matches_migration(self):
        import importlib
        migration = importlib.import_module("core.migrations.0006_results_leads_teachers")
        sql_file = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "002_results_leads_teachers.sql"
        self.assertIn(migration.POSTGRES_SQL.strip(), sql_file.read_text(encoding="utf-8").replace("\r\n", "\n"))

    def test_sql_file_004_matches_migration(self):
        import importlib
        migration = importlib.import_module("core.migrations.0007_analytics_students_news")
        sql_file = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "004_analytics_students_news.sql"
        self.assertIn(migration.POSTGRES_SQL.strip(), sql_file.read_text(encoding="utf-8").replace(chr(13) + chr(10), chr(10)))
