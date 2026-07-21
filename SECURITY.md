# Security policy

## Reporting a vulnerability

Report suspected vulnerabilities privately to the repository owner through the project's private security-reporting channel. Do not open a public issue, include live credentials in a report, or test against data or accounts you do not own. Include affected routes, reproduction steps, impact, and a safe proof of concept. Rotate any credential accidentally disclosed during testing.

## Trust model

SynthNet uses a custom email-free username/PIN identity model. The browser is untrusted. Next.js route handlers authenticate the HTTP-only session, validate input, enforce same-origin mutations, and make server-side calls. PostgreSQL functions revalidate the session for sensitive operations and keep authorization, writes, and audit records atomic.

The Supabase service-role/secret key and provider-key encryption key are server-only. Browser Supabase roles have no table access, exposed tables use deny-by-default RLS, and application RPCs revoke default `PUBLIC`, `anon`, and `authenticated` execution before granting `service_role` explicitly.

## Authentication and authorization

- PINs are bcrypt-hashed at cost 12; plaintext PINs are never stored or logged.
- Sessions use random 256-bit tokens. Only SHA-256 token hashes are persisted.
- Cookies are HTTP-only, `SameSite=Strict`, secure in production, and time-bounded.
- Login, registration, account, and privileged endpoints are rate-limited.
- Registration requires an expiring, usage-limited invitation. Only invitation hashes are stored.
- Owners alone can create admin invitations or grant/remove the owner role.
- The database protects the current actor and last active owner from unsafe lifecycle actions.
- PIN reset, account disable/suspension, role changes, deletion, and forced logout revoke sessions as appropriate.
- Privileged and security-sensitive actions are written to append-only audit logs.

## Browser and API protections

Production responses use a nonce-based Content Security Policy, HSTS, frame denial, MIME sniffing prevention, restrictive referrer and permissions policies, and cross-origin isolation headers. Mutation routes require an allowed origin and perform strict Zod validation. Error responses avoid database and credential details.

## Secret handling

- Never commit `.env` or production credentials.
- Never prefix a secret with `NEXT_PUBLIC_`.
- Keep `SUPABASE_SERVICE_ROLE_KEY` and `API_KEY_ENCRYPTION_KEY` in an encrypted deployment secret store.
- Treat invitation codes and session tokens as credentials while valid.
- Rotate bootstrap PINs before production use.
- Plan provider-key re-encryption before rotating `API_KEY_ENCRYPTION_KEY`.
- Run `npm run doctor` and `npm run security` before deployment.

## Database changes

Every public table must have RLS enabled and explicit browser-role privilege revocation. Every new function must set an explicit empty `search_path`, use the least-powerful security mode possible, revoke default execution, and grant only the required role. Apply immutable migrations through the Supabase CLI, review advisors afterward, and test restoration before high-risk production work.

## Operations checklist

Use HTTPS end to end, configure trusted proxy hops exactly, disable demo mode in production, use individual operator accounts, monitor privileged audit events, review dependencies and Supabase advisors, maintain encrypted backups, and regularly test account recovery and database restoration. The complete deployment checklist is in [SETUP.md](./SETUP.md).

## Supported version

Security fixes are applied to the current `main` branch. Older snapshots are not maintained; deploy the latest reviewed release and its complete migration set.
