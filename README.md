# Stanford Educational Centre — project structure

```
/project
  index.html   → public site
  main.js      → public site logic (navbar, quiz, FAQ, trial form, i18n)
  admin.html   → staff admin panel
  admin.js     → admin panel logic (Supabase login + news CRUD)
```

## Why admin.html was breaking

`admin.js` calls `window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)`
the moment the page loads. If those two values are still the placeholder text
(`"PASTE_YOUR_..."`), that call throws immediately and the whole script stops —
nothing else on the page runs. That's the root cause of the error.

## Setup steps (do these in order)

### 1. Create a Supabase project
Go to https://supabase.com → New project. Free tier is fine.

### 2. Get your API credentials
In your Supabase project: **Project Settings → API**
- Copy the **Project URL**
- Copy the **anon public** key

Open `admin.js` and replace the two placeholder lines near the top:
```js
const SUPABASE_URL = "PASTE_YOUR_PROJECT_URL_HERE";
const SUPABASE_ANON_KEY = "PASTE_YOUR_ANON_PUBLIC_KEY_HERE";
```

### 3. Create the two tables the admin panel needs
In Supabase: **SQL Editor → New query**, paste and run this:

```sql
-- News posts shown on the public site
create table news (
  id bigint generated always as identity primary key,
  title text not null,
  body text,
  created_at timestamptz not null default now()
);

-- Which logged-in emails are allowed into the admin panel, and their role
create table staff_roles (
  email text primary key,
  role text not null check (role in ('owner', 'editor'))
);

-- Enable Row Level Security (required — Supabase blocks all access by default
-- once RLS is on, until you add policies)
alter table news enable row level security;
alter table staff_roles enable row level security;

-- Anyone can read published news (for the public site, if you display it there)
create policy "Public can read news"
  on news for select
  using (true);

-- Only logged-in staff can insert/delete news
create policy "Staff can manage news"
  on news for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- A logged-in user can check their own row in staff_roles
create policy "Staff can read own role"
  on staff_roles for select
  using (auth.email() = email);
```

### 4. Create staff logins
In Supabase: **Authentication → Users → Add user** — create an account for
yourself (email + password).

Then in **Table Editor → staff_roles**, add a row with that same email and
`role = owner` (owners can delete news; `editor` can only add).

### 5. Open admin.html
Log in with the email/password you created in step 4. You should see the
dashboard with the publish form and news list.

## Notes
- `main.js` and `admin.js` are completely separate — they don't share any
  variables, so there's no conflict between the public site and the admin panel.
- The public site's trial-lesson form (in `main.js`) still has no backend —
  it just shows a success message. Connect it later to Telegram Bot API,
  Formspree, or EmailJS if you want to actually receive submissions.
- Never commit real Supabase keys to a public GitHub repo's history if you
  want to rotate them later — the anon key is safe to expose in the browser
  by design (RLS is what protects your data), but keep this in mind for
  any *service role* key, which must never be used in frontend code.

---

# Backend (Django) — added November 2026

The website no longer talks to Supabase directly. All data goes through a
Django API at `/api/...`, which connects to the same Supabase Postgres
database (existing tables and data are kept).

```
index.html / mock.html / admin.html   → served by Vercel as before
api/index.py + vercel.json            → runs Django on Vercel for /api/*
backend/                              → Django project
  config/settings.py                  → settings (reads backend/.env)
  core/models.py                      → the 5 existing tables
  core/views.py, core/urls.py         → the API
  core/tests.py                       → automated tests
requirements.txt                      → Python packages (used by Vercel)
```

## API

| Method | URL | Who |
|---|---|---|
| GET | `/api/mock-exams/` | public (with seat counts) |
| GET | `/api/news/`, `/api/news/<id>/image/` | public: published news, events and speaking clubs (upcoming first) |
| POST | `/api/trial-registrations/` | public |
| POST | `/api/exam-registrations/` | public; also takes the student's `password` (creates/uses the portal account) → `409 {code: EXAM_FULL / EXAM_CLOSED / ALREADY_REGISTERED}`, `403 {code: ACCOUNT_EXISTS}` |
| POST | `/api/analytics/hit/` | public, insert-only page view (no IP, no user agent stored) |
| GET | `/api/portal/mock/` | logged-in student: own mock registrations; scores only after they are published |
| GET/POST | `/api/auth/me/`, `/api/auth/login/`, `/api/auth/logout/` | admin login |
| GET… | `/api/admin/dashboard/`, `/api/admin/exams/`, `/api/admin/students/`, `/api/admin/news/`, `/api/admin/exam-registrations/<id>/` | staff only; DELETE = owner only |
| GET | `/api/admin/analytics/` | staff: visitors, views, registrations, conversion, daily series |
| GET | `/api/admin/mock-board/?tab=upcoming\|taken\|completed` | staff: students per tab |
| POST | `/api/admin/exam-registrations/<id>/publish/` (`/unpublish/` = owner only) | staff: the «Завершено» button |
| — | `/api/django-admin/` | Django's built-in admin (backup tool) |

The gallery page was removed (News covers it). The `gallery_photos` table is kept
untouched so no photo is lost; nothing reads it any more.

SQL for Supabase is in `supabase/migrations/` (run by hand, in order, before deploying).

Admin login: a Django user whose email is listed in `staff_roles`
(`owner` or `editor`). A Django superuser counts as owner.

## Run locally (Windows)

```
cd backend
python -m venv .venv
.venv\Scripts\pip install -r ..\requirements.txt
copy .env.example .env        (then fill in values)
.venv\Scripts\python manage.py migrate
.venv\Scripts\python manage.py test core
.venv\Scripts\python manage.py runserver
```

Open http://127.0.0.1:8000/ (site), /mock.html, /admin.html.
With `DATABASE_URL` empty, a local SQLite test database is used.

## Create an admin login

```
.venv\Scripts\python manage.py createsuperuser
```

Use your email as the username and email. Add editors from
`/api/django-admin/` (Users → add; then Staff roles → add their email).

## Vercel environment variables

`DATABASE_URL` (Supabase transaction pooler URI, port 6543),
`DJANGO_SECRET_KEY` (long random string), `DJANGO_DEBUG=0`.
