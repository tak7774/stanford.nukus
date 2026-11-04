from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from core.models import StaffRole

from .models import Assignment, Book, Enrollment, Group, Lesson, Profile, Submission

PW = "Zq7!hello-portal"


def signup(client, role="student", **kw):
    data = {"role": role, "full_name": "Aigerim Kasymova", "phone": "+998 91 303 60 01",
            "email": "Aigerim@Example.com", "password": PW, "note": "IELTS"}
    data.update(kw)
    return client.post("/api/portal/register/", data, format="json")


class PortalBase(APITestCase):
    def setUp(self):
        cache.clear()
        self.teacher_user = get_user_model().objects.create_user("portal-t1", "", PW)
        self.teacher = Profile.objects.create(user=self.teacher_user, role="teacher", full_name="Teacher One",
                                              phone="998900000001", email="t1@example.com", approved=True)
        self.other_user = get_user_model().objects.create_user("portal-t2", "", PW)
        self.other_teacher = Profile.objects.create(user=self.other_user, role="teacher", full_name="Teacher Two",
                                                    phone="998900000002", email="t2@example.com", approved=True)
        self.group = Group.objects.create(title="IELTS Intensive", teacher=self.teacher)
        self.other_group = Group.objects.create(title="Other group", teacher=self.other_teacher)

    def make_student(self, n=1, group=None):
        u = get_user_model().objects.create_user(f"portal-s{n}", "", PW)
        p = Profile.objects.create(user=u, role="student", full_name=f"Student {n}", phone=f"99890000010{n}",
                                   email=f"s{n}@example.com", approved=True)
        Enrollment.objects.create(group=group or self.group, student=p)
        return p

    def login_as(self, profile):
        c = APIClient()
        r = c.post("/api/portal/login/", {"email": profile.email, "password": PW}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        return c


class AccountTests(PortalBase):
    def test_student_signup_logs_in_and_has_no_staff_rights(self):
        c = APIClient()
        r = signup(c)
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(c.get("/api/portal/me/").json()["role"], "student")
        p = Profile.objects.get(email="aigerim@example.com")
        self.assertEqual(p.phone, "998913036001")
        self.assertEqual(p.user.email, "")
        self.assertEqual(c.get("/api/auth/me/").json(), {"authenticated": False})   # not staff
        self.assertEqual(c.get("/api/admin/students/").status_code, 403)

    def test_teacher_signup_waits_for_approval(self):
        c = APIClient()
        r = signup(c, role="teacher")
        self.assertEqual(r.status_code, 201)
        self.assertTrue(r.json()["pending"])
        self.assertEqual(c.get("/api/portal/me/").json(), {"authenticated": False})
        r = c.post("/api/portal/login/", {"email": "aigerim@example.com", "password": PW}, format="json")
        self.assertEqual(r.status_code, 403)
        Profile.objects.filter(email="aigerim@example.com").update(approved=True)
        r = c.post("/api/portal/login/", {"email": "AIGERIM@example.com", "password": PW}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["role"], "teacher")

    def test_staff_email_cannot_be_registered(self):
        StaffRole.objects.create(email="owner@stanford.uz", role="owner")
        r = signup(APIClient(), email="Owner@Stanford.uz")
        self.assertEqual(r.status_code, 400)
        self.assertIn("email", r.json()["errors"])

    def test_duplicates_and_weak_passwords_rejected(self):
        self.assertEqual(signup(APIClient()).status_code, 201)
        self.assertIn("email", signup(APIClient(), phone="+998 90 111 22 33").json()["errors"])
        self.assertIn("phone", signup(APIClient(), email="new@example.com").json()["errors"])
        self.assertIn("password", signup(APIClient(), email="a@example.com", phone="998900009999", password="12345678").json()["errors"])
        self.assertIn("phone", signup(APIClient(), email="b@example.com", phone="123").json()["errors"])

    def test_wrong_password_and_unknown_email_get_same_answer(self):
        c = APIClient()
        a = c.post("/api/portal/login/", {"email": "t1@example.com", "password": "nope"}, format="json")
        b = c.post("/api/portal/login/", {"email": "ghost@example.com", "password": "nope"}, format="json")
        self.assertEqual((a.status_code, a.json()), (b.status_code, b.json()))

    def test_portal_user_cannot_use_staff_api_or_staff_login(self):
        c = self.login_as(self.teacher)
        self.assertEqual(c.get("/api/admin/dashboard/").status_code, 403)
        r = APIClient().post("/api/auth/login/", {"email": "t1@example.com", "password": PW}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_logout(self):
        c = self.login_as(self.teacher)
        c.post("/api/portal/logout/")
        self.assertEqual(c.get("/api/portal/me/").json(), {"authenticated": False})

    def test_dashboards_need_login_and_right_role(self):
        anon = APIClient()
        for url in ["/api/portal/student/", "/api/portal/teacher/", "/api/portal/library/"]:
            self.assertIn(anon.get(url).status_code, (401, 403), url)
        s = self.make_student()
        self.assertEqual(self.login_as(s).get("/api/portal/teacher/").status_code, 403)
        self.assertEqual(self.login_as(self.teacher).get("/api/portal/student/").status_code, 403)
        unapproved = Profile.objects.create(
            user=get_user_model().objects.create_user("portal-x", "", PW), role="teacher", full_name="Pending T",
            phone="998900000009", email="x@example.com", approved=False)
        c = APIClient(); c.force_login(unapproved.user)
        self.assertEqual(c.get("/api/portal/teacher/").status_code, 403)
        self.assertEqual(c.get("/api/portal/library/").status_code, 403)


class HomeworkFlowTests(PortalBase):
    def setUp(self):
        super().setUp()
        self.s1 = self.make_student(1)
        self.s2 = self.make_student(2, group=self.other_group)
        self.today = timezone.localdate()

    def create_task(self, c=None, group=None, **kw):
        data = {"group": (group or self.group).id, "title": "Writing Task 2", "instructions": "Write 250 words",
                "due_date": str(self.today + timedelta(days=3))}
        data.update(kw)
        return (c or self.login_as(self.teacher)).post("/api/portal/teacher/assignments/", data, format="json")

    def test_full_cycle(self):
        t = self.login_as(self.teacher)
        task_id = self.create_task(t).json()["id"]

        s = self.login_as(self.s1)
        dash = s.get("/api/portal/student/").json()
        self.assertEqual([x["title"] for x in dash["tasks"]], ["Writing Task 2"])
        self.assertEqual(dash["tasks"][0]["state"], "todo")

        self.assertEqual(s.post(f"/api/portal/student/assignments/{task_id}/submit/", {"text": "My essay"}, format="json").status_code, 201)
        self.assertEqual(s.get("/api/portal/student/").json()["tasks"][0]["state"], "submitted")
        s.post(f"/api/portal/student/assignments/{task_id}/submit/", {"text": "My better essay"}, format="json")
        self.assertEqual(Submission.objects.count(), 1)

        queue = t.get("/api/portal/teacher/").json()["queue"]
        self.assertEqual([(q["student"], q["text"]) for q in queue], [("Student 1", "My better essay")])

        r = t.post(f"/api/portal/teacher/submissions/{queue[0]['id']}/review/", {"grade": "7.0", "feedback": "Good"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(t.get("/api/portal/teacher/").json()["queue"], [])
        task = s.get("/api/portal/student/").json()["tasks"][0]
        self.assertEqual((task["state"], task["grade"], task["feedback"]), ("reviewed", "7.0", "Good"))
        r = s.post(f"/api/portal/student/assignments/{task_id}/submit/", {"text": "change"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_student_cannot_submit_for_other_group_or_empty(self):
        other_task = Assignment.objects.create(group=self.other_group, title="X", due_date=self.today)
        s = self.login_as(self.s1)
        self.assertEqual(s.post(f"/api/portal/student/assignments/{other_task.id}/submit/", {"text": "hi"}, format="json").status_code, 404)
        mine = Assignment.objects.create(group=self.group, title="Mine", due_date=self.today)
        self.assertEqual(s.post(f"/api/portal/student/assignments/{mine.id}/submit/", {"text": "  "}, format="json").status_code, 400)

    def test_teacher_cannot_touch_other_teachers_group(self):
        self.assertEqual(self.create_task(group=self.other_group).status_code, 404)
        sub = Submission.objects.create(assignment=Assignment.objects.create(group=self.other_group, title="X", due_date=self.today), student=self.s2, text="t")
        t = self.login_as(self.teacher)
        self.assertEqual(t.post(f"/api/portal/teacher/submissions/{sub.id}/review/", {"grade": "9"}, format="json").status_code, 404)
        self.assertEqual(t.get(f"/api/portal/teacher/groups/{self.other_group.id}/students/").status_code, 404)
        self.assertEqual(t.get("/api/portal/teacher/").json()["queue"], [])

    def test_students_only_see_their_own_tasks(self):
        Assignment.objects.create(group=self.other_group, title="Secret", due_date=self.today)
        titles = [x["title"] for x in self.login_as(self.s1).get("/api/portal/student/").json()["tasks"]]
        self.assertEqual(titles, [])

    def test_task_validation(self):
        self.assertEqual(self.create_task(title="").status_code, 400)
        self.assertEqual(self.create_task(due_date="not-a-date").status_code, 400)

    def test_group_student_list_and_schedule(self):
        t = self.login_as(self.teacher)
        self.assertEqual(t.get(f"/api/portal/teacher/groups/{self.group.id}/students/").json()["students"],
                         [{"name": "Student 1", "phone": "998900000101"}])
        now = timezone.now()
        Lesson.objects.create(group=self.group, starts_at=now + timedelta(days=1), ends_at=now + timedelta(days=1, hours=1))
        Lesson.objects.create(group=self.group, starts_at=now + timedelta(days=20), ends_at=now + timedelta(days=20, hours=1))
        s = self.login_as(self.s1).get("/api/portal/student/").json()
        self.assertEqual(len(s["week"]), 1)
        self.assertIsNotNone(s["groups"][0]["next_lesson"])
        self.assertEqual(t.get("/api/portal/teacher/").json()["groups"][0]["students"], 1)


class LibraryTests(PortalBase):
    def setUp(self):
        super().setUp()
        self.s1 = self.make_student(1)

    def add(self, c, **kw):
        data = {"group": self.group.id, "title": "Cambridge IELTS 18", "kind": "pdf", "url": "https://example.com/book.pdf"}
        data.update(kw)
        return c.post("/api/portal/library/", data, format="json")

    def test_teacher_adds_student_sees_only_own_groups_books(self):
        t = self.login_as(self.teacher)
        self.assertEqual(self.add(t).status_code, 201)
        Book.objects.create(group=self.other_group, title="Hidden", url="https://example.com/h")
        lib = self.login_as(self.s1).get("/api/portal/library/").json()
        self.assertEqual([b["title"] for b in lib["books"]], ["Cambridge IELTS 18"])
        self.assertEqual(self.login_as(self.s1).get("/api/portal/student/").json()["books"][0]["title"], "Cambridge IELTS 18")

    def test_bad_links_and_wrong_group_rejected(self):
        t = self.login_as(self.teacher)
        for bad in ["javascript:alert(1)", "ftp://example.com/x", "not a url", "data:text/html,hi"]:
            self.assertEqual(self.add(t, url=bad).status_code, 400, bad)
        self.assertEqual(self.add(t, group=self.other_group.id).status_code, 404)

    def test_students_cannot_add_or_delete(self):
        s = self.login_as(self.s1)
        self.assertEqual(self.add(s).status_code, 403)
        book = Book.objects.create(group=self.group, title="B", url="https://example.com/b")
        self.assertEqual(s.delete(f"/api/portal/library/{book.id}/").status_code, 403)

    def test_teacher_deletes_only_own_group_books(self):
        mine = Book.objects.create(group=self.group, title="B", url="https://example.com/b")
        theirs = Book.objects.create(group=self.other_group, title="C", url="https://example.com/c")
        t = self.login_as(self.teacher)
        self.assertEqual(t.delete(f"/api/portal/library/{theirs.id}/").status_code, 404)
        self.assertEqual(t.delete(f"/api/portal/library/{mine.id}/").status_code, 204)
