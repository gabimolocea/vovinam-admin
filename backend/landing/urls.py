from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'news', views.NewsPostViewSet)
router.register(r'news-comments', views.NewsCommentViewSet)
router.register(r'events', views.EventViewSet)
router.register(r'about', views.AboutSectionViewSet)
router.register(r'contact-messages', views.ContactMessageViewSet)
router.register(r'contact-info', views.ContactInfoViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('landing-page-data/', views.landing_page_data, name='landing_page_data'),
    path('contact/submit/', views.submit_contact_form, name='submit_contact_form'),
]