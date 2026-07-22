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

If OAuth login is used, also set:

- `OAUTH_SERVER_URL`
- `OWNER_OPEN_ID`
- `VITE_APP_ID`

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

## 4. Seed Initial Task Definitions

After the schema exists, run:

```bash
node seed-task-definitions.mjs
```

The seed script skips if `task_categories` already contains data.

If you already ran `supabase/seed-task-definitions.sql` in Supabase SQL Editor, you do not need to run this script.

## 5. Redeploy Vercel

After adding or changing Vercel environment variables, redeploy the latest deployment so the running app receives the new values.

## Notes

- Legacy MySQL migration files remain under `drizzle/*.sql` and `drizzle/meta`.
- New Supabase/Postgres migrations are generated under `drizzle/migrations`.
- The backend still exposes the same tRPC API paths; only the database driver/dialect changed.
