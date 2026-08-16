# Supabase Postgres Setup

This app uses the existing Express/tRPC backend with Drizzle ORM connected to Supabase Postgres.

## 1. Create Supabase Project

Create a Supabase project, then copy the Postgres connection string from:

Project Settings -> Database -> Connection string

For Vercel/serverless, prefer the pooled connection string and keep `sslmode=require`.

## 2. Configure Environment Variables

Set these in Vercel Project Settings -> Environment Variables:

- `DATABASE_URL`
- `JWT_SECRET`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `ADMIN_EMAILS` - comma-separated administrator email addresses; do not commit this value to Git.
- `AUTH_REQUIRED` and `VITE_AUTH_REQUIRED` - set both to `true` only when the
  email-login gate should be enabled. The current shared deployment uses `false`.

Optional analytics placeholders:

- `VITE_ANALYTICS_ENDPOINT`
- `VITE_ANALYTICS_WEBSITE_ID`

For local development, copy `.env.example` to `.env` and fill in the real values.

## 3. Apply Database Schema

After setting `DATABASE_URL`, run:

```bash
pnpm db:push
```

The project script runs Drizzle's `generate` and `migrate` commands. With the committed baseline migration, this applies the Postgres schema to the database in `DATABASE_URL`.

If you prefer using only the Supabase dashboard:

1. Open Supabase SQL Editor.
2. Paste and run `drizzle/migrations/0000_supabase_postgres_baseline.sql`.
3. Paste and run `supabase/seed-task-definitions.sql`.

### Data-safety migration

`drizzle/migrations/0002_data_safety.sql` is additive: it adds revision numbers,
soft-delete timestamps, audit logs, database-side `updatedAt` triggers, and direct
table access restrictions. It does not delete or rename existing tables or columns.

Apply this migration to a Supabase Preview Branch or staging database first. Do not
run it against production until the preview verification has passed and the changes
have been approved.

```bash
# DATABASE_URL must point to the Preview Branch, not production.
node scripts/apply-sql-migration.mjs drizzle/migrations/0002_data_safety.sql
```

The connection URL supplied by Supabase may contain a placeholder password. Replace
that placeholder with the **database password** from Supabase Database Settings. It
is not the Supabase service-role key and not the JWT secret.

## 3.1 Backup and Restore Procedure

Before any production migration:

1. In Supabase Dashboard, open **Database -> Backups** and confirm a recent
   successful physical backup exists. For a more precise recovery point, enable PITR
   in the project plan if available.
2. Create a Supabase Preview Branch **with data** and run the migration there first.
3. Record the migration file name, deployment commit, backup timestamp, and row
   counts for `task_states`, `store_check_states`, `individual_handovers`, and
   `customer_handovers`.

If recovery is required, use **Database -> Backups -> Restore** to create a restored
project or restore to the selected recovery point. Verify the four table counts and
sample records in the restored environment before repointing `DATABASE_URL`. Do not
attempt a production restore from the application UI.

Customer and individual handovers are logically deleted after the data-safety
migration. Restore them through the application undo action or the protected restore
API; physical deletion is reserved for an administrator-only maintenance operation.

### Calendar automation migration

`drizzle/migrations/0003_calendar_auto_tasks.sql` is also additive. It creates a
separate table for generated calendar tasks, with an audit trail and a unique rule
and month key. It never changes or deletes existing task, store-check, or handover
records.

Apply it to a Preview Branch with data before production:

```bash
# DATABASE_URL must point to the Preview Branch, not production.
node scripts/apply-sql-migration.mjs drizzle/migrations/0003_calendar_auto_tasks.sql
```

Complete the staging dry run in `CALENDAR_AUTOMATION_SETUP.md` before enabling the
production cron job.

### AtInn handover migration and photo storage

`drizzle/migrations/0004_atinn_handover_issues.sql` is additive. It creates the
AtInn handover issue library used by `/atinn-handover`; it does not modify existing
customer or task records. Apply it to a Supabase Preview Branch before production.

The Before/After image uploader also requires the server-only
`BUILT_IN_FORGE_API_URL` and `BUILT_IN_FORGE_API_KEY` storage proxy variables.
Set them in the local `.env` and Vercel project settings. Do not expose either
value through a `VITE_` variable.

```bash
# DATABASE_URL must point to the Preview Branch, not production.
node scripts/apply-sql-migration.mjs drizzle/migrations/0004_atinn_handover_issues.sql
```

### AtInn handover category migration

`drizzle/migrations/0005_atinn_handover_issue_categories.sql` adds a category
column to each existing AtInn handover issue. Existing records remain
uncategorized until an operator selects one in the app. Apply it after the
AtInn handover migration and before deploying the category UI.

```bash
# DATABASE_URL must point to the Preview Branch, not production.
node scripts/apply-sql-migration.mjs drizzle/migrations/0005_atinn_handover_issue_categories.sql
```

## 4. Seed Initial Task Definitions

After the schema exists, run:

```bash
node seed-task-definitions.mjs
```

The seed script skips if `task_categories` already contains data.

If you already ran `supabase/seed-task-definitions.sql` in Supabase SQL Editor, you do not need to run this script.

## 5. Redeploy Vercel

After adding or changing Vercel environment variables, redeploy the latest deployment so the running app receives the new values.

## 6. Administrator Login

The deployed application uses Supabase Auth email magic links. Before enabling
the protected deployment:

1. In **Authentication -> URL Configuration**, set the Site URL to the stable
   Vercel URL and add the root URL plus `/auth/callback` to Redirect URLs.
2. In **Authentication -> Sign In / Providers**, confirm that Email is enabled.
3. In Vercel, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from
   Supabase **Project Settings -> API**. These values are public browser
   configuration; never use a service-role key in a `VITE_` variable.
4. Set `ADMIN_EMAILS` in Vercel to the approved administrator addresses. The
   application accepts a valid Supabase session only when its email is on this
   allowlist. Other addresses can complete the email flow but cannot view or
   change application data.
5. Redeploy, open `/login`, and request a magic link using an allowlisted email.

Do not enable the protected deployment until all three Vercel variables are set.
Without them, the login page intentionally blocks access rather than exposing
task or customer data.

## Notes

- Legacy MySQL migration files remain under `drizzle/*.sql` and `drizzle/meta`.
- New Supabase/Postgres migrations are generated under `drizzle/migrations`.
- The backend still exposes the same tRPC API paths; only the database driver/dialect changed.
