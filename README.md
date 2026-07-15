# SynthNet

SynthNet is a private, black-and-white developer network with custom PIN authentication, role-aware administration, encrypted API-key storage, an AI sandbox, audit logging, and a registry-driven toolbox.

## Run locally

```bash
npm install
npm run dev
```

With no Supabase credentials, development uses an in-memory server-only store. Sign in with the seeded owner credentials from the project brief. The development store never runs in production.

## Production configuration

1. Create a Supabase project and apply the files in `supabase/migrations` in filename order.
2. Copy `.env.example` to `.env.local` and set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
3. Generate `API_KEY_ENCRYPTION_KEY` with `openssl rand -hex 32`.
4. Keep `SYNTHNET_DEMO_MODE=false` in production.
5. Deploy behind HTTPS and rotate the initial owner PIN after first access.

The service-role key and encryption key are server-only and must never use a `NEXT_PUBLIC_` prefix.

## Security model

- PINs use bcrypt cost 12 and are never returned to the browser.
- Sessions use 256-bit opaque tokens; only SHA-256 token hashes are stored.
- Cookies are HTTP-only, same-site strict, and secure in production.
- Five failed PIN attempts lock the account for 15 minutes. A second IP/identity limiter protects the login route.
- Provider keys use AES-256-GCM with a deployment-specific encryption key.
- RLS is enabled on every Supabase table. Browser roles have no direct table grants because custom identities are authorized in protected server routes.
- Audit records are append-only at the database layer.
- Mutating routes enforce same-origin requests and validate payloads with Zod.

## Commands

```bash
npm run typecheck
npm run lint
npm run build
npm start
```

New tools are registered in `lib/tools/catalog.ts`; the catalog, global search, dashboard counts, and category views update automatically.
