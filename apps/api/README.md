# Casino API

This workspace contains the Casino backend.

## Backend technology

- Supabase Postgres for persistent game and room data.
- Supabase Realtime for room updates.
- Supabase Edge Functions (Deno) for server-authoritative sessions and game actions.
- SQL migrations in `supabase/migrations`.

There is intentionally no separate Express/Nest server: the existing Supabase Edge Functions are the API used by the mobile client.

## Commands

Run these commands from the repository root:

- `npm run api:start` — start the local Supabase stack.
- `npm run api:stop` — stop the local Supabase stack.
- `npm run api:typecheck` — typecheck the Edge Functions.
- `npm run api:test` — run backend regression tests.

To serve Edge Functions locally, start Supabase, then run `supabase functions serve` from this directory.
