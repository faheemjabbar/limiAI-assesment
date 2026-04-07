import logging
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import Order, SyncCheckpoint
from .serializers import OrderSerializer

logger = logging.getLogger(__name__)


class OrderListCreateView(generics.ListCreateAPIView):
    queryset = Order.objects.all()
    serializer_class = OrderSerializer
    permission_classes = [AllowAny]


class OrderDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Order.objects.all()
    serializer_class = OrderSerializer
    permission_classes = [AllowAny]


@api_view(["GET"])
@permission_classes([AllowAny])
def unsynced_orders(request):
    limit = int(request.query_params.get("limit", 100))
    checkpoint = SyncCheckpoint.objects.filter(entity_type="order").first()
    min_pk = checkpoint.last_synced_pk if checkpoint else 0

    orders = list(Order.objects.filter(synced_to_mongo=False, pk__gt=min_pk).order_by("pk")[:limit])
    return Response({"count": len(orders), "results": OrderSerializer(orders, many=True).data})


@api_view(["POST"])
@permission_classes([AllowAny])
def mark_synced(request):
    order_ids = request.data.get("order_ids", [])
    if not order_ids:
        return Response({"error": "order_ids is required"}, status=status.HTTP_400_BAD_REQUEST)

    updated = Order.objects.filter(pk__in=order_ids).update(
        synced_to_mongo=True,
        synced_at=timezone.now(),
    )
    logger.info("Marked %d orders as synced", updated)

    SyncCheckpoint.objects.update_or_create(
        entity_type="order",
        defaults={"last_synced_pk": max(order_ids)},
    )

    return Response({"marked_synced": updated})


@api_view(["GET"])
@permission_classes([AllowAny])
def sync_status(request):
    total = Order.objects.count()
    synced = Order.objects.filter(synced_to_mongo=True).count()
    checkpoint = SyncCheckpoint.objects.filter(entity_type="order").first()

    return Response(
        {
            "total_orders": total,
            "synced_to_mongo": synced,
            "pending_sync": total - synced,
            "last_synced_pk": checkpoint.last_synced_pk if checkpoint else 0,
            "last_synced_at": checkpoint.last_synced_at.isoformat() if checkpoint else None,
        }
    )
