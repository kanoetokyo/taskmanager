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

## 4. Seed Initial Task Definitions

After the schema exists, run:

```bash
node seed-task-definitions.mjs
```

The seed script skips if `task_categories` already contains data.

## Notes

- Legacy MySQL migration files remain under `drizzle/*.sql` and `drizzle/meta`.
- New Supabase/Postgres migrations are generated under `drizzle/migrations`.
- The backend still exposes the same tRPC API paths; only the database driver/dialect changed.
