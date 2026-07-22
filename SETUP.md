# SynthNet setup and operations guide

## Project overview

SynthNet is a private Next.js application for social collaboration, developer, network, security, utility, and bring-your-own-key AI workflows. It uses a custom username/PIN identity model because accounts do not require email addresses. Supabase provides PostgreSQL persistence, private object storage, Realtime change delivery, constraints, row-level security, atomic authorization functions, distributed rate limits, sessions, notifications, and audit records.

The trust boundary is intentional:

- The browser renders the UI and runs local-only tools.
- Next.js route handlers validate every request, enforce same-origin mutations, and call fixed upstream endpoints.
- A server-only Supabase client uses the service-role key. The key is never shipped to the browser.
- Authenticated server-sent event streams subscribe to Supabase Realtime and emit only account-authorized refresh signals; message and notification payloads remain behind authenticated APIs.
- PostgreSQL functions revalidate custom sessions and make privileged writes and audit entries in one transaction.
- `anon` and `authenticated` have no table or function access. RLS has no allow policies by design, so direct Data API access is denied.

## Folder structure

```text
app/
  api/                  Authenticated route handlers
  globals.css           Global responsive design system
  layout.tsx            Metadata and application shell
  page.tsx              Server-rendered session gate
components/
  app/                  Authenticated shell and lazy-loaded views
  auth/                 Login and invitation registration screens
  social/               Realtime collaboration workspace
lib/
  client/               Browser request and theme helpers
  server/               Auth, social services, profiles, encryption, and limits
  social/               Shared social domain types
  tools/                Registry-driven tool catalog
scripts/                Secret-safe environment diagnostics
supabase/migrations/    Ordered, immutable database migrations
.github/                CI and dependency update automation
middleware.ts           Per-request nonce CSP
next.config.ts          Build and security headers
```

## Required software

- Node.js 20.9 or newer
- npm 10 or newer
- Git
- A Supabase project for persistent or production use
- Supabase CLI for the recommended migration workflow

Check local versions:

```bash
node --version
npm --version
supabase --version
```

## Install dependencies

Use the lockfile for a clean, reproducible install:

```bash
npm ci
```

If `.next` is incomplete or startup reports a missing `middleware-manifest.json` or `pages/_app.js`, stop every running Next.js process, run `npm ci`, then run `npm run build` again. Do not copy a partial `.next` directory between machines.

## Create and link a Supabase project

1. Create a project in the Supabase dashboard.
2. Record its project reference and API URL.
3. Install and authenticate the CLI.
4. Link this checkout to the project.

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
```

The configured project for the current deployment is `tcijommnekjtpoflmlsy`. Use a separate project for local experiments or staging.

## Environment variables

Copy the template and fill in secrets locally:

```bash
cp .env.example .env.local
openssl rand -hex 32
npm run doctor
```

Required variables:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Server-side project API URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service-role or modern secret key |
| `API_KEY_ENCRYPTION_KEY` | 32 random bytes encoded as exactly 64 hexadecimal characters |
| `APP_ORIGIN` | Exact canonical origin accepted by mutation routes |
| `TRUSTED_PROXY_HOPS` | Reverse-proxy hops trusted to append `X-Forwarded-For`; normally `1` |
| `SYNTHNET_DEMO_MODE` | `true` only for local in-memory development; always `false` in production |

Rules:

- Never prefix a secret with `NEXT_PUBLIC_`.
- Do not use the anon/publishable key as `SUPABASE_SERVICE_ROLE_KEY`. Startup rejects a legacy JWT whose role is `anon`.
- Use the deployment platform's encrypted secret store. Do not commit `.env`, `.env.local`, or production values.
- Set `APP_ORIGIN` to the externally visible HTTPS origin in production, with no path.
- Rotate the encryption key only with a planned re-encryption procedure; changing it immediately makes existing provider keys unreadable.

## Database setup and migrations

Migrations are imperative and ordered by timestamp. Apply them from a trusted workstation:

```bash
npx supabase db push
npx supabase migration list
```

For a brand-new database, the migrations create:

- `accounts`, `account_profiles`, `registration_invites`, `sessions`, `activity_logs`, `api_keys`, `website_settings`, and `feature_flags`
- the `account_type` enum
- primary, foreign-key, partial, composite, and cleanup indexes
- append-only audit enforcement
- deny-by-default RLS and revoked browser-role grants
- service-role-only registration, profile, session, lockout, account-management, API-key, cleanup, and rate-limit functions
- account-scoped dashboard summaries, keyset-paginated audit reads, and atomic API-key deletion
- a non-exposed `private.rate_limits` table
- bootstrap owner records stored with bcrypt hashes, never plaintext PINs
- profiles, presence, friendships, blocks, conversations, group membership and invitations
- messages, replies, edits, reactions, receipts, pins, attachments, typing state, reports, and moderation actions
- account-scoped notifications and global-chat moderation settings
- optimized conversation summaries, full-text/trigram message search, anti-spam constraints, and notification triggers
- a private `social-uploads` Storage bucket with MIME and size restrictions
- Realtime publication entries for the social tables used by the authenticated event bridge

Do not edit a migration after it has been applied. Add a new migration for every schema change. Review SQL locally and use a staging project before a high-risk production migration.

### RLS model

All exposed tables have RLS enabled. There are intentionally no `anon` or `authenticated` policies because SynthNet does not map its username accounts to Supabase Auth users. Browser roles also have their table and function privileges revoked. Supabase's advisor therefore reports informational `rls_enabled_no_policy` notices; for this architecture, those notices describe the intended deny-all posture.

If the application later moves to Supabase Auth, create user-to-account mappings and explicit least-privilege policies before granting browser access. Do not use user-editable JWT metadata as an authorization source.

## Authentication setup

SynthNet does not require email and does not use Supabase Auth for end-user login.

- Usernames are normalized lowercase identifiers.
- New PINs must contain 6–12 digits. Legacy login accepts 4–12 digits to preserve compatibility.
- PIN hashes use bcrypt cost 12.
- Five failed PIN attempts cause a 15-minute lock.
- Sessions use 256-bit random tokens; only SHA-256 token hashes are stored.
- Session cookies are HTTP-only, `SameSite=Strict`, secure in production, and expire after 12 hours.
- Locking, disabling, resetting a PIN, or changing a role revokes relevant sessions.
- The database prevents removal of the last active owner.
- Public registration is disabled. A normal or admin invitation is required, and only owners can issue admin invitations.
- Invitation codes are generated with high entropy, shown once, stored only as SHA-256 hashes, usage-limited, expiring, revocable, and consumed under a row lock.

Rotate every bootstrap PIN after initial deployment. Create named administrator accounts for operators instead of sharing an owner identity.

### Register an account

1. Sign in as an administrator and open **Admin → Invitations**.
2. Choose the account role, expiry, and maximum uses. Admin invitations require an owner.
3. Create the invitation and copy the one-time code before leaving the panel.
4. On the login screen choose **Register**, enter a username, 6–12 digit PIN, and the invitation code.

Registration signs the new account in immediately. No email address is collected or synthesized. Owner accounts cannot be created through an invitation; owner promotion remains an explicit owner-only action.

### Account self-service

The Settings view lets each signed-in account edit its display name, bio, and dark/light/system theme; rotate its PIN after confirming the current PIN; inspect active sessions; revoke an individual session; or sign out every other device. Sensitive changes are enforced in PostgreSQL and recorded in the append-only activity log.

## Storage setup

The social migration creates the private `social-uploads` bucket. Uploads are limited to 25 MB and an allowlist of image, video, audio, PDF, text, and common document formats. The server validates size and MIME type, writes randomized account-scoped paths, and returns short-lived signed URLs. Browser roles have no direct bucket access.

For production, add malware scanning or content-disarm processing before allowing untrusted documents to be downloaded outside the application. Keep the bucket private and do not add public read policies.

## Realtime and presence

The migration adds social tables to the `supabase_realtime` publication. The browser connects only to `/api/social/events`; the server validates the custom session, subscribes with the service-role client, checks conversation membership, and sends generic invalidation events. Data is then fetched through account-authorized APIs. This preserves the username/PIN trust model and never exposes the service role key.

Presence is refreshed by the authenticated event stream and by idle/visibility heartbeats. Records older than 90 seconds are rendered offline, so an interrupted connection cannot leave a user permanently online.

## Edge Functions

The application uses database functions and triggers for atomic social writes, anti-spam, notification fan-out, authorization invariants, and moderation state. It intentionally keeps the HTTP/session bridge in Next.js rather than an Edge Function because end users authenticate with opaque SynthNet sessions rather than Supabase Auth JWTs. This keeps one audited session boundary and avoids forwarding the service-role key. If an Edge Function is added later, require a valid JWT unless it implements and documents equivalent custom-session verification.

## Run locally

Persistent Supabase-backed development:

```bash
npm run doctor
npm run dev
```

Explicit in-memory development:

```bash
SYNTHNET_DEMO_MODE=true npm run dev
```

The demo store is server-only, resets when the process restarts, and is prohibited in production. Never use it for shared or sensitive data.

Open `http://localhost:3000`. If another process owns the port, stop it or pass another port to Next and update `APP_ORIGIN` to match.

On macOS, do not keep active Node.js repositories in Desktop/Documents when those folders are synchronized by iCloud or another File Provider. On-demand hydration can make `next start`, TypeScript, Git, and module resolution pause for minutes or produce transient missing-module errors. Move the checkout to a local development directory such as `~/Developer/KometSynth`, then run a clean `npm ci` and `npm run build` there.

`npm run doctor` reads local environment files without printing secret values. It rejects anon keys in the service-role slot, malformed encryption keys, unsafe origins, unsupported runtimes, and suspicious public secret names.

## Production build

Run the explicit quality gates and build:

```bash
npm run typecheck
npm run lint
npm run security
npm run build
npm start
```

`next build` skips its duplicate ESLint pass for speed; the dedicated scoped `npm run lint` command remains required in CI. TypeScript errors still fail the production build.

GitHub Actions runs `npm ci --ignore-scripts`, a production dependency audit, lint, typecheck, and the production build with read-only repository permissions. Dependabot groups weekly production and development dependency updates to reduce review noise.

## Deployment

1. Provision a supported Node.js runtime.
2. set every required environment variable in the platform secret manager;
3. set `SYNTHNET_DEMO_MODE=false`;
4. run `npm ci` and `npm run build` in an immutable build stage;
5. start with `npm start` behind an HTTPS reverse proxy;
6. configure the proxy to replace, not blindly trust, client forwarding headers;
7. set `TRUSTED_PROXY_HOPS` for that topology;
8. set `APP_ORIGIN` to the exact public origin;
9. verify CSP, HSTS, cookie, and no-store headers;
10. run a sign-in, role-denial, account-management, and logout smoke test.

Configure uptime monitoring against `GET /api/health`. It is intentionally a dependency-free liveness check and returns no database or environment details. Validate database readiness through an authenticated application smoke test so public probes cannot amplify database traffic.

Do not deploy the repository's local `.env` file or `.next` directory. Generate `.next` during deployment.

## Backup and recovery strategy

- Enable the backup/PITR option appropriate to the Supabase plan and recovery objective.
- Take an encrypted logical backup before every high-risk migration.
- Keep backups in a separate access-controlled location.
- Test restore procedures against an isolated project on a schedule.
- Document recovery point and recovery time objectives.
- Back up database schema and data; provider API keys remain encrypted and also require the matching encryption key.
- Store the encryption key in a separately backed-up secret manager, not inside the database dump.

## Security checklist

- [ ] Valid service-role/secret key is present only on the server.
- [ ] No secret uses a `NEXT_PUBLIC_` prefix.
- [ ] `APP_ORIGIN` is exact and HTTPS in production.
- [ ] Reverse-proxy header handling matches `TRUSTED_PROXY_HOPS`.
- [ ] Demo mode is disabled.
- [ ] Bootstrap PINs have been rotated.
- [ ] Each operator has an individual account and minimum necessary role.
- [ ] RLS remains enabled and browser grants remain revoked.
- [ ] New functions revoke default `PUBLIC` execute and explicitly grant only required roles.
- [ ] Supabase security and performance advisors have been reviewed.
- [ ] Dependency audit, security guardrails, typecheck, lint, build, and smoke tests pass.
- [ ] Invitation expiry, revocation, role restrictions, and one-time code handling have been tested.
- [ ] Account session and PIN-rotation controls have been tested.
- [ ] CSP contains a per-request nonce and no production `unsafe-inline` script allowance.
- [ ] HTTPS, HSTS, secure cookies, and no-store responses are verified at the public endpoint.
- [ ] Rate-limit retention cleanup is scheduled by calling `cleanup_expired_sessions()` from a trusted job.
- [ ] Database backups and secret recovery have been tested.

## Troubleshooting

### `A valid server-only Supabase service-role key is required`

The key is missing, malformed, or is an anon JWT. Copy the server-only service-role/secret value from the protected project settings into the deployment secret manager. Never paste it into client code.

### Authentication works in demo mode but not with Supabase

Check the environment key type, confirm `npx supabase migration list`, and inspect Supabase API/Postgres logs. Confirm the hardening migration exists and all application functions grant execute to `service_role` only.

### Missing `.next/server/middleware-manifest.json` or `pages/_app.js`

The build output is incomplete. Stop active Next.js processes, run `npm ci`, run `npm run build` to completion, and only then run `npm start`.

### `Cannot find module '../route-kind'` inside `node_modules/next`

The dependency tree is incomplete or a synchronized folder has offloaded part of `node_modules`. Move the checkout outside Desktop/iCloud, remove the incomplete dependency directory, run `npm ci`, and rebuild. Do not copy or synchronize `node_modules` or `.next` between machines.

### Mutation returns 403

Confirm the browser's origin exactly matches `APP_ORIGIN`, including scheme and port. Check reverse-proxy host rewriting and the browser's `Sec-Fetch-Site` value.

### Requests are grouped under the wrong IP

Validate that the reverse proxy appends a trusted `X-Forwarded-For` entry and set `TRUSTED_PROXY_HOPS` to the exact proxy count. Use `0` when forwarding headers cannot be trusted; rate limits then use the safe `unknown` bucket.

### Existing provider keys cannot decrypt

Confirm `API_KEY_ENCRYPTION_KEY` is unchanged. Version 1 ciphertext remains readable; new version 2 ciphertext is additionally bound to the account and provider using authenticated data.

### Install, lint, build, or startup is unusually slow on macOS

If the checkout is inside a synced Desktop/Documents folder or another file-provider location, framework modules can take minutes to materialize even though the application is healthy. Move the checkout to a non-synced local development directory, run `npm ci`, and rebuild there. In verification, the same production build started in about 600 ms from `/private/tmp` while the Desktop-backed copy spent minutes reading identical modules.

## Common commands

```bash
npm ci                         # Reproducible dependency install
npm run doctor                 # Validate local runtime and environment safely
npm run dev                    # Development server
npm run security               # Static secret, duplicate, RLS, and ACL guardrails
npm run typecheck              # Strict TypeScript validation
npm run lint                   # Scoped ESLint and accessibility rules
npm run build                  # Optimized production build
npm run verify                 # Security, lint, typecheck, and production build
npm start                      # Start a completed production build
npm audit                      # Dependency vulnerability report
npx supabase migration list    # Compare local and remote migrations
npx supabase db push           # Apply pending migrations
npx supabase db lint           # Database lint checks
```

## Recommended future improvements

1. Add a staging Supabase project and an automated migration-drift promotion gate.
2. Move operator provisioning out of seed data and into a one-time audited bootstrap command.
3. Add key rotation with multiple decryption keys and background re-encryption.
4. Add pagination and export workflows when audit volume exceeds the current 100-row UI window.
5. Add browser integration tests for concurrent lockout, invitation consumption, last-owner protection, session revocation, and rate-limit windows.
6. Add private Storage only when a concrete file workflow requires it.
