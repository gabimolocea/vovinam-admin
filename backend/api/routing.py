"""
WebSocket URL routing configuration
"""
from django.urls import path
from . import consumers

websocket_urlpatterns = [
    # Scoring and display updates per field or event
    path('ws/scoring/field/<int:field_id>/', consumers.ScoringConsumer.as_asgi()),
    path('ws/scoring/event/<int:event_id>/', consumers.ScoringConsumer.as_asgi()),
    
    # Admin dashboard updates per event
    path('ws/admin/event/<int:event_id>/', consumers.AdminDashboardConsumer.as_asgi()),
]
