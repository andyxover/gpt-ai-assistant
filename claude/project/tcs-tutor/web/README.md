# TCS Tutor — Web

Next.js 16 web app for teachers, students, and parents. Sits next to
`../app` (the Node backbone + LINE webhook) and shares the same
Supabase Postgres.

## Setup

```bash
npm install
cp .env.example .env.local
# Edit .env.local — fill in the values below.
npm run dev
# → http://localhost:3100
```

### Required env vars

| Var                              | Where to get it                                                       |
| -------------------------------- | --------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`       | Supabase Dashboard → Project Settings → API → Project URL             |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | Supabase Dashboard → Project Settings → API → anon / publishable key  |
| `SUPABASE_SERVICE_ROLE_KEY`      | Supabase Dashboard → Project Settings → API → service_role key (secret) |
| `DATABASE_URL`                   | Supabase Dashboard → Database → Connection string → Transaction       |
| `ANTHROPIC_API_KEY`              | console.anthropic.com → API keys                                      |

### Dev-mode auth bypass

`TUTOR_DEV_USER_ID` skips Supabase Auth and returns a `public.users`
row directly. Useful for building / testing without setting up
Google OAuth.

```
00000000-0000-0000-0000-000000000010 → demo teacher
00000000-0000-0000-0000-000000000020 → demo student
00000000-0000-0000-0000-000000000030 → demo parent
```

Leave the env var **unset** in production.

## Auth

Two paths are supported on `/login`:

1. **Email / password** — works out of the box with any Supabase
   project. Students sign up with the email their teacher enrolled
   them under in `/teacher/classes/[id]/roster`. Sign-up requires
   email confirmation (Supabase default).
2. **Google OAuth** — requires extra setup:
   - Supabase Dashboard → Authentication → Providers → enable Google
   - Google Cloud Console → APIs & Services → Credentials → create
     OAuth client. Add the Supabase callback URL shown in the
     Supabase provider config.
   - Paste the Google Client ID + Secret into Supabase.

In both cases, `getTutorUser()` (in `src/lib/tutor/role.ts`) matches
the authenticated email against `public.users.email` to look up the
TCS Tutor role + display name + linked records.

## Layout

```
src/app/
├── login/                     Sign-in / sign-up
├── auth/callback/             OAuth code → session exchange
├── teacher/
│   ├── page.tsx               Card grid
│   ├── syllabi/               Upload + parse syllabus, view concepts
│   ├── classes/               Class list, new class, class detail
│   │   └── [id]/
│   │       ├── progress/      Week-by-week scope rollup
│   │       ├── activity/      Active students, accuracy, AI insight
│   │       ├── roster/        Add / withdraw students
│   │       └── syllabus/      Links to syllabus detail
│   └── flagged/               Review student-flagged questions
├── student/
│   ├── page.tsx               Practice mode picker
│   ├── practice/              MCQ practice loop
│   ├── chat/                  Scope-constrained tutor chat
│   ├── mistakes/              Wrong-answer review
│   └── reports/               Mastery dashboards
└── parent/
    ├── page.tsx               → /parent/this-week
    ├── this-week/             AI-generated weekly digest (EN / 中)
    ├── history/               Per-week practice rollup
    ├── exam-prediction/       Readiness bar + next exam
    ├── message-teacher/       Form
    └── notifications/         Preferences
```
