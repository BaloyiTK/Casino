# Online multiplayer setup

The mobile app uses Supabase with PostgreSQL for public/private rooms and the player lobby.

## 1. Create a Supabase project

Create a project at https://supabase.com and keep its project URL and publishable/anon key available.

## 2. Configure anonymous player sign-in

In Supabase Dashboard, open **Authentication → Sign In / Providers** and enable **Anonymous sign-ins**. The current lobby uses anonymous player sessions; account linking can be added later.

## 3. Apply the database migration

Run the SQL in `supabase/migrations/20261125000100_online_rooms.sql` using the Supabase SQL Editor, or link the project with the Supabase CLI and run `supabase db push`.

## 4. Configure the Expo app

Create `apps/mobile/.env` (do not commit this file):

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

Restart Expo after changing environment variables.

## Current scope

- Create a Two Hands (2-player) or Four Hands (4-player) room.
- Choose public or private visibility.
- Private rooms are joined by sharing the room code.
- Public rooms are discoverable in the lobby and accept players until full.
- Room creation and joining are atomic database functions; a room cannot be overfilled.
- Each installation receives an anonymous Supabase player session.

The multiplayer lobby is the first online foundation. Dealing and gameplay actions must next move to server-authoritative functions before online matches are enabled. Do not send private hands to other players or trust client-submitted card state.
