# Calendar-Derived Task Automation

This implementation reads Google Calendar only. It never creates, edits, moves, or
deletes Calendar events. It creates one Task Revolution record per rule and target
month, and updates that record only when the matched final visit or chosen office day
changes.

## Fixed behavior

- Sync runs on the 1st and 21st of each month at 09:00 Japan time.
- On the 21st it evaluates the following month. On the 1st it rechecks the current
  month.
- A visit matches only when **every** configured string appears in the event
  description. The event title is not used as a customer identifier.
- The latest matching visit in the target month is the final visit.
- The task is assigned to the previous day's office-presence date. If that day has
  no qualifying office event, the sync searches backward up to seven calendar days.
- Office presence requires both the configured Calendar color ID and a configured
  title term. For the current calendar, confirm the color ID from a real approved
  event before adding it to a rule.
- If no office day is found, the generated Task Revolution row is marked
  `needs_review`, appears as an overdue task, and has a review suffix. It is not
  silently scheduled on a non-office day.
- If a final matching visit disappears later, the generated row is kept and changed
  to a review task. No task state is physically deleted.

## Google service account

1. In Google Cloud Console, create a service account dedicated to this integration.
2. Enable **Google Calendar API** in that Cloud project.
3. Create a JSON key for the service account and store it securely. Do not commit
   the JSON file to Git or share it in chat.
4. In Google Calendar sharing settings, share only the required source calendar with
   the service-account email. Grant **See all event details** and do not grant any
   edit or management permission.
5. From the JSON key, copy `client_email` and `private_key` into the Vercel
   variables listed below.

## Vercel environment variables

Add these as **Sensitive** variables in Preview first, then Production after the
staging check. Do not put customer data in repository files.

| Key | Initial staging value |
| --- | --- |
| `GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL` | Service account `client_email` |
| `GOOGLE_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY` | Service account `private_key` including line breaks |
| `CRON_SECRET` | A new long random value, kept only in Vercel/local secure shell |
| `CALENDAR_AUTO_TASK_RULES_JSON` | Private JSON rule array described below |
| `CALENDAR_AUTOMATION_ENABLED` | `true` for the staging dry run, then `false` again until approved |
| `VITE_CALENDAR_AUTOMATION_ENABLED` | `false` until a staging write has been checked |

For production, set both `CALENDAR_AUTOMATION_ENABLED` and
`VITE_CALENDAR_AUTOMATION_ENABLED` to `true` only after migration and staging
verification are approved. The cron endpoint rejects any request without
`Authorization: Bearer <CRON_SECRET>`.

## Private rule template

Place the actual values only in Vercel's `CALENDAR_AUTO_TASK_RULES_JSON`. This is a
template, not a value to commit:

```json
[
  {
    "id": "customer-a-invoice",
    "calendarId": "calendar-owner@example.com",
    "customerMatch": {
      "descriptionMustContain": [
        "Customer name",
        "Phone number",
        "Address"
      ]
    },
    "officePresence": {
      "titleContainsAny": ["NAO", "新井"],
      "colorId": "3",
      "searchBackDays": 7
    },
    "task": {
      "title": "Customer name invoice printing",
      "category": "調整および書類作成",
      "defaultPlanned": "当日事務担当"
    }
  }
]
```

The `id` is stable. Do not change it after the first production sync; it is part of
the monthly duplicate-prevention key.

## Staging verification

1. Confirm a Supabase backup, then create a Supabase Preview Branch **with data**.
2. Point a Vercel Preview deployment's `DATABASE_URL` to that branch.
3. Apply `drizzle/migrations/0003_calendar_auto_tasks.sql` to the Preview Branch.
4. Add the variables above in Preview. Keep `VITE_CALENDAR_AUTOMATION_ENABLED=false`.
5. Run a dry run for a specific target month from a secure shell. Do not paste the
   secret into source code or chat:

   ```powershell
   $headers = @{ Authorization = "Bearer $env:CRON_SECRET" }
   Invoke-WebRequest `
     -Headers $headers `
     -Uri "https://YOUR-PREVIEW-DEPLOYMENT/api/cron/calendar-task-sync?month=YYYY-MM&dryRun=1"
   ```

6. Confirm the response count, then invoke the same URL without `dryRun=1`.
7. Temporarily set `VITE_CALENDAR_AUTOMATION_ENABLED=true` in Preview, redeploy,
   and verify exactly one generated task is shown in `調整および書類作成` on the
   selected office date. Check that its checkbox, assignee, and note save normally.
8. Change nothing in Google Calendar. Verify Calendar event contents and audit logs
   remain read-only from the integration's perspective.
9. Record the target month, generated task date, and deployment commit. Restore the
   Preview flags to `false` if production approval has not been given.

## Production rollout

After the staging checks are approved:

1. Confirm the pre-migration Supabase backup timestamp.
2. Apply `0003_calendar_auto_tasks.sql` to production.
3. Add the same sensitive variables to Production, enable both automation flags,
   and redeploy the approved commit.
4. Call the cron endpoint once with `dryRun=1` for the intended month, review the
   returned count, then call it once without `dryRun=1`.
5. Check the task page and the `audit_logs` row before relying on the scheduled run.

Vercel Cron jobs run only in Production. The committed `vercel.json` schedule is
`0 0 1,21 * *`, which is 09:00 in Japan.
