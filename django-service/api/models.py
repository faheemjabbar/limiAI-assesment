from django.db import models


class Order(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("processing", "Processing"),
        ("shipped", "Shipped"),
        ("delivered", "Delivered"),
        ("cancelled", "Cancelled"),
    ]

    external_id = models.UUIDField(unique=True, editable=False)
    customer_email = models.EmailField(db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending", db_index=True)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)
    synced_to_mongo = models.BooleanField(default=False, db_index=True)
    synced_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "orders"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Order {self.external_id} ({self.status})"


class SyncCheckpoint(models.Model):
    entity_type = models.CharField(max_length=64, unique=True)
    last_synced_pk = models.BigIntegerField(default=0)
    last_synced_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "sync_checkpoints"

    def __str__(self):
        return f"Checkpoint({self.entity_type}) → pk={self.last_synced_pk}"
