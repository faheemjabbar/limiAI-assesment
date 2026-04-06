"""URL configuration for the Django legacy service."""

from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse


def health_check(request):
    """Health check endpoint consumed by the real-time dashboard."""
    return JsonResponse({
        "service": "django-legacy",
        "status": "healthy",
        "version": "1.0.0",
    })


urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", health_check, name="health_check"),
    path("api/v1/", include("api.urls")),
]
