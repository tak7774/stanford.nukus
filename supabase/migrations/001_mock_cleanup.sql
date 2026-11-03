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

commit;
