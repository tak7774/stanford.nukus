from django.urls import path

from . import views

urlpatterns = [
    # Public website
    path("mock-exams/", views.PublicMockExamList.as_view()),
    path("news/", views.PublicNewsList.as_view()),
    path("news/<int:pk>/image/", views.news_image),
    path("analytics/hit/", views.PageViewCreate.as_view()),
    path("trial-registrations/", views.PublicTrialRegistrationCreate.as_view()),
    path("exam-registrations/", views.PublicExamRegistrationCreate.as_view()),
    path("mock-results/lookup/", views.MockResultLookup.as_view()),
    path("results/", views.PublicResultList.as_view()),
    path("results/<int:pk>/image/", views.result_image),
    path("teachers/", views.PublicTeacherList.as_view()),
    path("teachers/<int:pk>/image/", views.teacher_image),
    # Admin login
    path("auth/me/", views.MeView.as_view()),
    path("auth/login/", views.LoginView.as_view()),
    path("auth/logout/", views.LogoutView.as_view()),
    # Admin panel
    path("admin/dashboard/", views.AdminDashboard.as_view()),
    path("admin/exams/", views.AdminExamList.as_view()),
    path("admin/exams/<int:pk>/", views.AdminExamDetail.as_view()),
    path("admin/exams/<int:pk>/registrations/", views.AdminExamRegistrationList.as_view()),
    path("admin/exam-registrations/<int:pk>/", views.AdminExamRegistrationDetail.as_view()),
    path("admin/students/", views.AdminStudentList.as_view()),
    path("admin/students/<int:pk>/", views.AdminStudentDetail.as_view()),
    path("admin/news/", views.AdminNewsList.as_view()),
    path("admin/news/<int:pk>/", views.AdminNewsDetail.as_view()),
    path("admin/analytics/", views.AdminAnalytics.as_view()),
    path("admin/mock-board/", views.AdminMockBoard.as_view()),
    path("admin/exam-registrations/<int:pk>/publish/", views.AdminPublishResult.as_view()),
    path("admin/exam-registrations/<int:pk>/unpublish/", views.AdminUnpublishResult.as_view()),
    path("admin/results/", views.AdminResultList.as_view()),
    path("admin/results/reorder/", views.AdminResultReorder.as_view()),
    path("admin/results/<int:pk>/", views.AdminResultDetail.as_view()),
    path("admin/teachers/", views.AdminTeacherList.as_view()),
    path("admin/teachers/reorder/", views.AdminTeacherReorder.as_view()),
    path("admin/teachers/<int:pk>/", views.AdminTeacherDetail.as_view()),
]
