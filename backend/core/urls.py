from django.urls import path

from . import views

urlpatterns = [
    # Public website
    path("mock-exams/", views.PublicMockExamList.as_view()),
    path("news/", views.PublicNewsList.as_view()),
    path("gallery/", views.PublicGalleryList.as_view()),
    path("gallery/<int:pk>/image/", views.gallery_image),
    path("trial-registrations/", views.PublicTrialRegistrationCreate.as_view()),
    path("exam-registrations/", views.PublicExamRegistrationCreate.as_view()),
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
    path("admin/gallery/", views.AdminGalleryList.as_view()),
    path("admin/gallery/reorder/", views.AdminGalleryReorder.as_view()),
    path("admin/gallery/<int:pk>/", views.AdminGalleryDetail.as_view()),
]
