# Online multiplayer setup

The mobile app uses Supabase with PostgreSQL for public/private rooms and the player lobby.

## 1. Create a Supabase project

Create a project at https://supabase.com and keep its project URL and publishable/anon key available.

## 2. Enable anonymous player sign-in

In Supabase Dashboard, open **Authentication → Sign In / Providers** and enable **Anonymous Sign-ins**. The current lobby creates an anonymous player session for each installation. Account registration and account linking can be added later.

## 3. Apply all database migrations

Run all SQL migration files in `supabase/migrations/` in filename order using the Supabase SQL Editor:

1. `20261125000100_online_rooms.sql`
2. `20261125000200_room_snapshot.sql`
3. `20261125000300_room_roster_realtime.sql`

Alternatively, install the Supabase CLI, link this repository to your project, and run `supabase db push`.

## 4. Configure the Expo app

Copy `apps/mobile/.env.example` to `apps/mobile/.env` and fill in your own project values:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

Do not commit `.env` or service-role keys. The mobile app must only use the publishable/anon key. Restart Expo after changing environment variables.

## Implemented room foundation

- Create a Two Hands (2-player) or Four Hands (4-player) room.
- Choose public or private visibility.
- Private rooms are joined by sharing the room code; they are not listed publicly.
- Public rooms appear in the lobby with their occupied/open slots.
- Players can join public rooms from the lobby or join either room type using its code.
- Database functions lock the room while joining, assign the next free seat, and prevent overfilling.
- Room membership is checked server-side; room rosters are visible only to members.
- Realtime room and roster changes refresh the waiting lobby.

## Still to implement before a real match

The room lobby is not yet the complete multiplayer game. Dealing, turn validation, card actions, captured piles, scoring, reconnection, and private-hand delivery must move to server-authoritative operations before online matches are enabled. Never broadcast a player's hand to other clients or trust client-submitted card state.
