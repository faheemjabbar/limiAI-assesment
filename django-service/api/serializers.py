import uuid
from rest_framework import serializers
from .models import Order, SyncCheckpoint


class OrderSerializer(serializers.ModelSerializer):
    class Meta:
        model = Order
        fields = ["id", "external_id", "customer_email", "status", "total_amount",
                  "created_at", "updated_at", "synced_to_mongo"]
        read_only_fields = ["id", "external_id", "created_at", "updated_at", "synced_to_mongo"]

    def create(self, validated_data):
        validated_data["external_id"] = uuid.uuid4()
        return super().create(validated_data)


class SyncCheckpointSerializer(serializers.ModelSerializer):
    class Meta:
        model = SyncCheckpoint
        fields = "__all__"
