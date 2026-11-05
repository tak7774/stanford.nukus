from django.urls import path

from . import views

urlpatterns = [
    path("me/", views.MeView.as_view()),
    path("register/", views.RegisterView.as_view()),
    path("login/", views.LoginView.as_view()),
    path("logout/", views.LogoutView.as_view()),
    path("student/", views.StudentDashboard.as_view()),
    path("student/assignments/<int:pk>/submit/", views.StudentSubmit.as_view()),
    path("mock/", views.StudentMock.as_view()),
    path("teacher/", views.TeacherDashboard.as_view()),
    path("teacher/groups/<int:pk>/students/", views.TeacherGroupStudents.as_view()),
    path("teacher/assignments/", views.TeacherAssignmentCreate.as_view()),
    path("teacher/submissions/<int:pk>/review/", views.TeacherReview.as_view()),
    path("library/", views.Library.as_view()),
    path("library/<int:pk>/", views.LibraryBook.as_view()),
]
