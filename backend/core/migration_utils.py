"""Helper for migrations that must also work after the same SQL was run by hand on Supabase."""
from django.db import migrations


class IdempotentOnPostgres(migrations.operations.base.Operation):
    """On PostgreSQL run `sql` (written with IF NOT EXISTS, safe to repeat);
    on any other database (SQLite for local testing) run the normal Django `operations`.

    Django's migration state always follows `operations`, so models and the
    database stay in step either way. `sql` must create exactly what
    `operations` describe.
    """

    reduces_to_sql = False
    reversible = False

    def __init__(self, sql, operations):
        self.sql = sql
        self.operations = operations

    def deconstruct(self):
        return (self.__class__.__name__, [], {"sql": self.sql, "operations": self.operations})

    def state_forwards(self, app_label, state):
        for op in self.operations:
            op.state_forwards(app_label, state)

    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        if schema_editor.connection.vendor == "postgresql":
            schema_editor.execute(self.sql)
            return
        state = from_state.clone()
        for op in self.operations:
            new_state = state.clone()
            op.state_forwards(app_label, new_state)
            op.database_forwards(app_label, schema_editor, state, new_state)
            state = new_state

    def database_backwards(self, app_label, schema_editor, from_state, to_state):
        raise NotImplementedError("This migration cannot be reversed automatically.")

    def describe(self):
        return "Idempotent SQL on PostgreSQL, normal operations elsewhere"
