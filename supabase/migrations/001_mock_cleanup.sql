-- ============================================================
-- 001_mock_cleanup.sql — Mock exam clean-up
-- Run this whole file once in Supabase → SQL Editor → New query → Run.
-- It is safe to run more than once (every step checks "if exists / if not exists").
-- Run it right before you deploy the new site code.
-- ============================================================

begin;

-- ── 1. Remove passport from the mock exam ──
-- WARNING: this PERMANENTLY DELETES every stored passport number.
-- They cannot be recovered afterwards (unless you have a backup).
alter table exam_registrations drop column if exists passport_id;

-- ── 2. Stop marking unpaid registrations as paid ──
-- Click/Payme are not connected yet, so no one has really paid online.
-- amount_due = the price at sign-up; amount_paid is filled only when staff confirm payment.
alter table exam_registrations add column if not exists amount_due integer;
update exam_registrations set payment_status = 'pending' where payment_status = 'paid';

-- ── 6. Save what we collect: exam format + ticket number ──
alter table exam_registrations add column if not exists format text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'exam_registrations_format_check') then
    alter table exam_registrations
      add constraint exam_registrations_format_check check (format in ('paper', 'computer'));
  end if;
end $$;

alter table exam_registrations add column if not exists ticket_no text unique;

-- Ticket number = ST-<year>-MOCK-<id padded to at least 4 digits>, e.g. ST-2026-MOCK-0042.
-- Made by the database on every insert, so it is always unique.
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

-- Give ticket numbers to registrations that already exist.
update exam_registrations
  set ticket_no = 'ST-'
    || to_char(coalesce(registered_at, now()) at time zone 'Asia/Tashkent', 'YYYY')
    || '-MOCK-'
    || lpad(id::text, greatest(4, length(id::text)), '0')
  where ticket_no is null;

-- ── 7. Price and location for each mock exam (set in the admin exam form) ──
alter table mock_exams add column if not exists price_uzs integer default 150000;
alter table mock_exams add column if not exists location text default 'Stanford Main Center, Nukus';

commit;
