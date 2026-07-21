# Contributing to SynthNet

## Development workflow

1. Use Node.js 20.9 or newer and npm 10 or newer.
2. Create a focused branch from the current `main` branch.
3. Run `npm ci` and copy `.env.example` to `.env.local` with non-production credentials.
4. Make the smallest coherent change and preserve the server/browser trust boundary.
5. Add a new timestamped migration for schema changes; never edit an applied migration.
6. Run the complete verification commands before requesting review.

```bash
npm run doctor
npm run security
npm run lint
npm run typecheck
npm run build
npm audit --omit=dev --audit-level=high
```

## Engineering standards

- Keep client components small and move secrets, authorization, and durable business rules to the server or PostgreSQL.
- Validate every external input and return stable, non-sensitive errors.
- Revalidate custom sessions inside database functions that perform privileged writes.
- Preserve accessibility: semantic controls, visible focus, keyboard operation, useful labels, sufficient contrast, loading states, and reduced-motion behavior.
- Prefer native APIs and existing project utilities before adding a dependency.
- Keep data access bounded, indexed, and paginated; avoid unbounded lists and N+1 queries.
- Add concise comments only where the reason is not evident from the code.

## Database review requirements

Schema changes must document constraints, foreign-key behavior, indexes matching real query patterns, RLS, table grants, function execution grants, and rollback/operational risk. Functions should use `security invoker`; a `security definer` function requires a written justification, an empty `search_path`, fully qualified objects, and tightly revoked execution.

Test migrations against a disposable or staging project. After applying them, compare `npx supabase migration list`, run `npx supabase db lint`, and review the security and performance advisors.

## Pull requests

Describe the user impact, architectural decision, security implications, database changes, verification performed, screenshots for visual changes, and any manual deployment order. Never attach environment files, database dumps containing user data, plaintext PINs, provider keys, session tokens, or live invitation codes.
