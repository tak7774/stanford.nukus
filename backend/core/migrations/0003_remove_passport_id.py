"""Remove passport numbers from mock exam registrations.

On Supabase this change is made by supabase/migrations/001_mock_cleanup.sql,
which the owner runs by hand in the SQL Editor. This migration repeats the
same "if exists" statement, so running `manage.py migrate` afterwards is safe
and only records the step as done. On the local SQLite test database it
removes the column the normal Django way.
"""
from django.db import migrations


def drop_passport(apps, schema_editor):
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute("alter table exam_registrations drop column if exists passport_id;")
        return
    model = apps.get_model("core", "ExamRegistration")
    schema_editor.remove_field(model, model._meta.get_field("passport_id"))


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0002_gallery_photos"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[migrations.RunPython(drop_passport, migrations.RunPython.noop)],
            state_operations=[migrations.RemoveField(model_name="examregistration", name="passport_id")],
        ),
    ]
