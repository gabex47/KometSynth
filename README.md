# SynthNet

SynthNet is a private developer workspace and collaboration platform with invite-only username/PIN registration, direct and group messaging, global chat, profiles, friends, notifications, role-aware administration, encrypted BYOK provider keys, append-only audit logging, and a registry-driven tool catalog.

```bash
npm ci
npm run dev
```

Production uses a server-only Supabase service-role client and deny-by-default RLS. Local development can use the explicitly enabled in-memory demo store. Never expose the service-role or encryption keys through a `NEXT_PUBLIC_` variable.

The social workspace includes realtime conversations, message replies, reactions, receipts, pins, search, uploads, voice notes, presence, group roles and invitations, profile privacy, moderation, anti-spam, and indexed cursor pagination. Supabase owns durable state, authorization constraints, notifications, private uploads, and realtime change delivery; authenticated Next.js routes bridge the application's custom sessions without exposing privileged credentials.

The dashboard uses account-scoped database summaries, audit history uses indexed cursor pagination, provider keys support atomic revocation, and privileged account changes are authorized and audited inside PostgreSQL. Administrators can issue expiring, usage-limited invitation codes; codes are shown once and only their SHA-256 hashes are stored.

See [SETUP.md](./SETUP.md) for setup and operations, [SECURITY.md](./SECURITY.md) for the security model and reporting process, and [CONTRIBUTING.md](./CONTRIBUTING.md) for the development workflow.

## Verification

```bash
npm run doctor
npm run security
npm run verify
npm start
```

Pull requests and main-branch pushes run the same lint, typecheck, production build, and dependency-audit gates in GitHub Actions.
