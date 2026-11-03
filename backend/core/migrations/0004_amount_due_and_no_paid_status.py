"""Registrations are never "paid" automatically any more.

Adds amount_due (the price at sign-up) and turns old "paid" rows back into
"pending", because Click/Payme were never really charged.

On Supabase this is done by supabase/migrations/001_mock_cleanup.sql (run by
hand). The same "if not exists" statements are repeated here, so running
`manage.py migrate` afterwards is safe. On SQLite (tests) the column is added
the normal Django way.
"""
from django.db import migrations, models

POSTGRES_SQL = """
alter table exam_registrations add column if not exists amount_due integer;
update exam_registrations set payment_status = 'pending' where payment_status = 'paid';
"""


def forwards(apps, schema_editor):
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute(POSTGRES_SQL)
        return
    model = apps.get_model("core", "ExamRegistration")
    field = models.IntegerField(null=True, blank=True)
    field.set_attributes_from_name("amount_due")
    schema_editor.add_field(model, field)
    model.objects.filter(payment_status="paid").update(payment_status="pending")


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0003_remove_passport_id"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[migrations.RunPython(forwards, migrations.RunPython.noop)],
            state_operations=[
                migrations.AddField(
                    model_name="examregistration",
                    name="amount_due",
                    field=models.IntegerField(blank=True, null=True),
                ),
            ],
        ),
        migrations.AlterField(
            model_name="examregistration",
            name="payment_status",
            field=models.TextField(
                blank=True,
                choices=[("pending", "Pending"), ("verified", "Verified")],
                default="pending",
                null=True,
            ),
        ),
    ]
