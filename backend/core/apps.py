from django.apps import AppConfig
from django.db.models.signals import post_migrate


def lock_django_tables(using, **_signal_kwargs):
    """Hide all Django tables (users, password hashes, sessions, photos) from Supabase's public API.

    Supabase exposes every table in the `public` schema through its REST API
    using the anon key that is in the website's JavaScript. Turning on Row
    Level Security with no policies blocks that API completely, while Django
    (connecting directly as the table owner) is unaffected.
    """
    from django.apps import apps
    from django.db import connections

    connection = connections[using]
    if connection.vendor != "postgresql":
        return
    django_tables = {m._meta.db_table for m in apps.get_models(include_auto_created=True)}
    with connection.cursor() as cursor:
        for table in connection.introspection.table_names(cursor):
            if table in django_tables:
                cursor.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"

    def ready(self):
        post_migrate.connect(lock_django_tables, sender=self)
