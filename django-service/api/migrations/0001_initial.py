"""
Initial migration — creates the Order and SyncCheckpoint tables.
"""

import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies: list = []

    operations = [
        migrations.CreateModel(
            name="Order",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("external_id", models.UUIDField(unique=True, editable=False)),
                ("customer_email", models.EmailField(db_index=True, max_length=254)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("processing", "Processing"),
                            ("shipped", "Shipped"),
                            ("delivered", "Delivered"),
                            ("cancelled", "Cancelled"),
                        ],
                        db_index=True,
                        default="pending",
                        max_length=20,
                    ),
                ),
                ("total_amount", models.DecimalField(decimal_places=2, max_digits=10)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("synced_to_mongo", models.BooleanField(default=False, db_index=True)),
                ("synced_at", models.DateTimeField(blank=True, null=True)),
            ],
            options={"db_table": "orders", "ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="SyncCheckpoint",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("entity_type", models.CharField(max_length=64, unique=True)),
                ("last_synced_pk", models.BigIntegerField(default=0)),
                ("last_synced_at", models.DateTimeField(auto_now=True)),
            ],
            options={"db_table": "sync_checkpoints"},
        ),
    ]
