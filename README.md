# HEXA CORE — ERP Distribution

## Stack
- Next.js 16
- React 19
- Supabase Auth + PostgreSQL
- Vercel deployment

## Environment configuration

Copy `.env.example` to `.env.local` for local development. Configure the same variables in the Vercel project under **Settings → Environment Variables**.

Required variables:

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | Supabase publishable/anon key for browser and server session clients |
| `SUPABASE_SECRET_KEY` | Server only | Supabase administrative operations used by PIN login |
| `PIN_PEPPER` | Server only | Additional secret used to verify stored scrypt PIN hashes |

For this project, the Supabase project URL is `https://vwxzlvsigxeopibnfuhp.supabase.co`. Retrieve the active publishable key from Supabase Project Settings → API Keys. Retrieve the **secret** key from the same page; never use a secret key in a `NEXT_PUBLIC_*` variable, client component, browser bundle, Git commit, or screenshot.

Generate a strong pepper locally with:

```bash
openssl rand -hex 32
```

Store the generated value as `PIN_PEPPER` in Vercel and in the local `.env.local` file. Do not change it casually: existing PIN hashes were derived with the pepper, so changing it can invalidate PIN verification for existing accounts unless hashes are migrated.

After adding or changing environment variables, redeploy the affected Vercel deployment. Variables are not retroactively injected into an already-built deployment.

## Deployment and test workflow

1. Push changes to `work/hexa-core-implementation-20261120`.
2. Open the linked Vercel Preview deployment for the commit/PR.
3. Confirm the Vercel build check is **Ready** before browser testing.
4. Open `/login`, test with an authorized user code and its 4-digit PIN, then verify authenticated navigation and protected routes.
5. Check Vercel Runtime Logs and Supabase Auth/Postgres logs if login fails. Never paste secret values into issues or chat.

A GitHub repository URL is source control, not a running application URL. The application URL is supplied by the connected deployment provider (currently Vercel).

## Scripts

```bash
npm ci
npm run dev
npm run lint
npm run build
```

## Important security notes
- Never commit `.env.local`, Supabase secret keys, or `PIN_PEPPER`.
- Do not replace the server secret with the public publishable key.
- Keep PIN validation and account lockout controls enabled.
