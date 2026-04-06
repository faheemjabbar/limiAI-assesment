from django.urls import path
from . import views

urlpatterns = [
    path("orders/", views.OrderListCreateView.as_view(), name="order-list"),
    path("orders/<int:pk>/", views.OrderDetailView.as_view(), name="order-detail"),
    path("sync/unsynced/", views.unsynced_orders, name="unsynced-orders"),
    path("sync/mark-synced/", views.mark_synced, name="mark-synced"),
    path("sync/status/", views.sync_status, name="sync-status"),
]
