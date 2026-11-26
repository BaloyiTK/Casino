# Casino

A custom South African Casino card game.

## Project structure

- **`apps/mobile`:** One cross-platform React Native + Expo application for Android and iOS.
- **`apps/api`:** Supabase backend, including Edge Functions and database migrations.
- **`docs/rules/LOCKED_RULES.md`:** Source of truth for confirmed game rules.

Android and iOS are build targets of the same mobile application, not separate projects. There is no separate web application.

## Install dependencies

Run once from the repository root:

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

The backend uses Supabase (Postgres, Realtime, and Edge Functions), not a separate Node/Express server.

Install the Supabase CLI, then run from the repository root:

```bash
npm run api:start
npm run api:stop
npm run api:functions:serve
npm run api:db:push
```

Use `npm run api:db:reset` to reset the local database. Database migrations and Edge Functions live under `apps/api/supabase/`.

## Run checks

```bash
npm test
```

The test runner checks the Expo/React Native TypeScript project, Supabase Edge Function types, shuffle and dealing, game invariants, recovery rules, and gameplay regression tests.

These are automated code-level checks. A live multiplayer playtest still requires a configured Supabase project and multiple devices.

## Development principles

- `docs/rules/LOCKED_RULES.md` is the source of truth for confirmed game rules.
- The game engine must enforce the 40-card integrity ledger.
- Unspecified rules must remain unimplemented until clarified.
