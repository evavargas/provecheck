# Deploying ProveCheck

Three pieces: the **API** (Docker on Render), the **panel** (static, Vercel) and the **web app** for collaborators and clients (static, Vercel). Data, auth and files live in a hosted **Supabase** project. The phone apps are built separately with EAS.

Order matters: Supabase first, then the API, then the two static sites, then CORS.

## 1. Supabase (production project)

1. Create a project (Pro plan: the Free plan has 1 GB of storage). Note the project ref.
2. Collect: project URL, `anon` key, `service_role` key, and the database connection string (Settings > Database, use the direct or session connection).
3. Apply the schema and create the private bucket:
   ```
   supabase login
   supabase link --project-ref <ref>
   supabase db push
   ```
   The migrations also create the `provecheck` bucket (private, JPEG/PNG/PDF only).
4. In the dashboard: **Authentication > Providers > Email: turn off "Allow new users to sign up"**. Accounts are created only by an administrator through the API.

## 2. API on Render

1. New > Blueprint, pick this repository. It reads `render.yaml` and builds `apps/api/Dockerfile`.
2. Fill the variables marked `sync: false`:
   | Variable                                                         | Value                                                            |
   | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
   | `DATABASE_URL`                                                   | the connection string from step 1                                |
   | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | from step 1 (the service role key is a secret: only here)        |
   | `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`                        | Gmail account and a **new** app password                         |
   | `CORS_ORIGINS`                                                   | the panel and web app URLs from step 3 (set after you have them) |
   | `APP_URL`                                                        | the web app URL (used in the mail)                               |
3. Run **one instance only**: the login rate limiter is in memory and the job worker runs inside the API process.
4. Check `https://<service>.onrender.com/health` answers `{"status":"ok"}`.

## 3. First administrator

From your machine, pointing at production (do not commit these values):

```
DATABASE_URL=... SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
  pnpm --filter api create-admin -- --org "Company name" --name "Full name" --username admin --email you@example.com --phone 099000000
```

It prints a temporary password once. The first login asks for a new password.

## 4. Panel and web app on Vercel

Two Vercel projects (`provecheck-panel`, `provecheck-app`), deployed from the repository root with the CLI because both need the shared package. The build settings live in `vercel.panel.json` and `vercel.mobile.json`; the API address is a build variable.

```
vercel link --project provecheck-panel --yes
vercel deploy --prod --yes --local-config vercel.panel.json --build-env VITE_API_URL=https://<service>.onrender.com

vercel link --project provecheck-app --yes
vercel deploy --prod --yes --local-config vercel.mobile.json --build-env EXPO_PUBLIC_API_URL=https://<service>.onrender.com
```

These deployments are not connected to Git: redeploy with the same commands after a change.

Then go back to Render, set `CORS_ORIGINS` (comma separated, no trailing slash) to the two production addresses and `APP_URL` to the web app address. Render redeploys by itself.

## 5. Check it end to end

1. Open the panel, sign in, finish the first login.
2. Create a service type, a company (with **your own email**), a collaborator and a client user.
3. Create a task, then use the web app as the collaborator: arrive, write the record, add a photo, finish.
4. Within a minute the PDF appears in the task detail and the mail reaches your address.

## 6. Phone apps

EAS builds, icons and store listings are not set up yet. The app needs `EXPO_PUBLIC_API_URL` at build time and the camera and photo permission texts already live in `apps/mobile/app.json`.

## Notes

- Never commit `.env` or any key. `.env.example` has empty placeholders.
- Storage has no lifecycle rules: the daily `expire-photos` and `cleanup-attachments` jobs delete the files (queued at 06:00 UTC).
- While testing, keep `SMTP_USER` empty locally so the worker does not send real mail.
