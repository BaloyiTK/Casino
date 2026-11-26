# Casino

A custom South African Casino card game.

## Project structure

- **`apps/mobile`:** One cross-platform React Native + Expo application for Android and iOS.
- **`apps/api`:** Supabase backend, including Edge Functions and database migrations.
- **Root `app/` and `lib/`:** Existing Next.js web prototype, retained for now.

The mobile application is a single codebase. Android and iOS are build targets of that same application; they are not separate projects.

## Install dependencies

Run this once from the repository root. npm workspaces install the root web app and both application workspaces together.

```bash
npm install
```

## Run the mobile app

```bash
npm run mobile
```

For a device-specific native run:

```bash
npm run mobile:android
npm run mobile:ios
```

## Run the backend

The backend uses Supabase (Postgres, Realtime, and Edge Functions). It is not a second Node/Express server.

Install and run the Supabase CLI, then use:

```bash
npm run api:start
npm run api:stop
```

Serve the Edge Functions locally:

```bash
npm run api:start
cd apps/api
supabase functions serve
```

Database migrations and Edge Functions are kept together under `apps/api/supabase/`. Supabase project configuration is therefore run from `apps/api`.

## Run all checks

```bash
npm test
```

The test runner checks root ESLint, root TypeScript, the Next.js production build, Expo/React Native TypeScript, Supabase Edge Function types, card/build invariants, recovery rules, and gameplay regression tests.

These are automated code-level checks. A live multiplayer playtest still requires a configured Supabase project and multiple signed-in devices.

## Development principles

- `docs/rules/LOCKED_RULES.md` is the source of truth for confirmed game rules.
- The game engine must enforce the 40-card integrity ledger.
- Unspecified rules must remain unimplemented until clarified.
- The existing Next.js prototype is retained while the cross-platform mobile app is developed.
