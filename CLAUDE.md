# ProveCheck

Field-service management: admin panel (web), collaborator/client app (Expo, mobile + web), API (Fastify). Functional spec: `docs/provecheck-documentacion-desarrollo.md` (wins on functionality and screens). Technical spec: `docs/provecheck-especificacion-tecnica.md`.

## Commands

- Install: `pnpm install`
- Local backend: `supabase start` (Postgres, Auth, Storage in Docker), then copy `.env.example` to `.env`
- Dev: `pnpm --filter api dev`, `pnpm --filter panel dev`, `pnpm --filter mobile start`
- First admin: `pnpm --filter api create-admin -- --org "Name" --name "Name" --username u --email e@x.com --phone 099...` (prints a temporary password once)
- DB tests: `pnpm db:test` (RLS, needs `supabase start`); API integration tests: `pnpm --filter api test:integration`
- Check: `pnpm -r typecheck && pnpm -r test && pnpm lint`

## Rules

- All code, identifiers, comments, commits and logs in English. Spanish only in `packages/shared/i18n/es.json` and the functional spec. i18n keys in English.
- No hardcoded UI strings; no avatars/photos of people; never use the Supabase service role from a client.
- Never commit secrets (`.env` is ignored). Mail goes through Gmail SMTP with an app password.
- Storage is Supabase Storage (private bucket, signed URLs). It has no lifecycle rules, so the `expire-photos` job deletes objects.
