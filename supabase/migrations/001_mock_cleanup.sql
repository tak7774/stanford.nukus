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

commit;
