"""Save the chosen exam format, and let the database create ticket numbers.

ticket_no looks like ST-2026-MOCK-0042 (year of registration, Tashkent time,
plus the registration id padded to at least 4 digits). A trigger fills it in
on every insert, so it is unique and never depends on the browser.

On Supabase this is done by supabase/migrations/001_mock_cleanup.sql (run by
hand). The same idempotent SQL is repeated here, so running
`manage.py migrate` afterwards is safe. On SQLite (tests) an equivalent
trigger is created.
"""
from django.db import migrations, models

FORMAT_CHOICES = [("paper", "Paper-based"), ("computer", "Computer-delivered")]

POSTGRES_SQL = r"""
alter table exam_registrations add column if not exists format text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'exam_registrations_format_check') then
    alter table exam_registrations
      add constraint exam_registrations_format_check check (format in ('paper', 'computer'));
  end if;
end $$;

alter table exam_registrations add column if not exists ticket_no text unique;

create or replace function exam_registrations_set_ticket_no()
returns trigger
language plpgsql
as $$
begin
  if new.ticket_no is null then
    new.ticket_no := 'ST-'
      || to_char(coalesce(new.registered_at, now()) at time zone 'Asia/Tashkent', 'YYYY')
      || '-MOCK-'
      || lpad(new.id::text, greatest(4, length(new.id::text)), '0');
  end if;
  return new;
end;
$$;

drop trigger if exists exam_registrations_ticket_no on exam_registrations;
create trigger exam_registrations_ticket_no
  before insert on exam_registrations
  for each row execute function exam_registrations_set_ticket_no();

update exam_registrations
  set ticket_no = 'ST-'
    || to_char(coalesce(registered_at, now()) at time zone 'Asia/Tashkent', 'YYYY')
    || '-MOCK-'
    || lpad(id::text, greatest(4, length(id::text)), '0')
  where ticket_no is null;
"""

SQLITE_TRIGGER = """
CREATE TRIGGER IF NOT EXISTS exam_registrations_ticket_no
AFTER INSERT ON exam_registrations
WHEN NEW.ticket_no IS NULL
BEGIN
  UPDATE exam_registrations
     SET ticket_no = 'ST-' || strftime('%Y', 'now', '+5 hours') || '-MOCK-'
                     || substr('0000' || NEW.id, -max(4, length(NEW.id)))
   WHERE id = NEW.id;
END;
"""


def forwards(apps, schema_editor):
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute(POSTGRES_SQL)
        return
    model = apps.get_model("core", "ExamRegistration")
    # ticket_no first: SQLite adds a unique column by rebuilding the table from
    # the old model, which would drop a column added just before it.
    ticket = models.TextField(unique=True, null=True, blank=True, editable=False)
    ticket.set_attributes_from_name("ticket_no")
    schema_editor.add_field(model, ticket)
    fmt = models.TextField(choices=FORMAT_CHOICES, null=True, blank=True)
    fmt.set_attributes_from_name("format")
    schema_editor.add_field(model, fmt)
    schema_editor.execute(SQLITE_TRIGGER)


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0004_amount_due_and_no_paid_status"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[migrations.RunPython(forwards, migrations.RunPython.noop)],
            state_operations=[
                migrations.AddField(
                    model_name="examregistration",
                    name="format",
                    field=models.TextField(blank=True, choices=FORMAT_CHOICES, null=True),
                ),
                migrations.AddField(
                    model_name="examregistration",
                    name="ticket_no",
                    field=models.TextField(blank=True, editable=False, null=True, unique=True),
                ),
            ],
        ),
    ]
