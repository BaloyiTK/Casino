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
4. `20261125000400_server_dealt_games.sql`
5. `20261125000500_room_current_player.sql`
6. `20261125000600_lock_private_game_state.sql`
7. `20261125000700_server_game_actions.sql`

Alternatively, install the Supabase CLI, link this repository to your project, and run `supabase db push`.

## 4. Configure the Expo app

Copy `apps/mobile/.env.example` to `apps/mobile/.env` and fill in your own project values:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

Do not commit `.env` or service-role keys. The mobile app must only use the publishable/anon key. Restart Expo after changing environment variables.

## 5. Deploy the server game function

Deploy the Edge Function from the repository root:

```bash
supabase functions deploy game-session
supabase functions deploy game-action
```

The function requires JWT authentication. Supabase supplies its server-side `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` secrets. Never add the service-role key to the mobile app or its `.env` file.

## Implemented room and dealing foundation

- Create a Two Hands (2-player) or Four Hands (4-player) room.
- Choose public or private visibility.
- Private rooms are joined by sharing the room code; they are not listed publicly.
- Public rooms appear in the lobby with their occupied/open slots.
- Players can join public rooms from the lobby or join either room type using its code.
- Database functions lock the room while joining, assign the next free seat, and prevent overfilling.
- Room membership is checked server-side; room rosters are visible only to members.
- Realtime room and roster changes refresh the waiting lobby.
- The host can start a full room; the server creates the deck using cryptographically secure Fisher–Yates shuffles, first per suit and then across the combined deck.
- The server deals two consecutive cards to each player in seat order, repeating five times.
- Four Hands receives 10 cards each from the full 40-card deck. Two Hands receives 10 each and keeps the remaining 20 cards in the same deck order for Round 2.
- The complete deck order and every hand are stored in a server-only table with no client read policy.
- The Edge Function returns only the authenticated player's hand; opponent card identities and the remaining deck are not returned.
- The online screen preserves the dealt hand order and shows opponents' cards face-down.
- Drafting, build creation, and ending a turn are submitted to the server. The server checks the active seat, card ownership, selected card locations, build value, duplicate build values, existing ownership limits, and the opponent-pile eligibility rule before changing the state.
- Game updates use a version check and database row lock to reject stale simultaneous actions.
- Two Hands Round 2 is dealt automatically from the preserved remaining 20 cards when Round 1 hands are exhausted.

## Still to implement before a playable match

Server-controlled initial dealing, private-hand retrieval, drafting, turn passing, the Two Hands Round 2 deal, and the first server-validated build-creation operation are implemented. The mobile table does not yet expose a build-creation selector. Build top-ups, captures, Shiya, partner actions, captured-pile gameplay, scoring, reconnect recovery, and full game completion still need implementation. Do not add client-side card state mutations. Never broadcast a player's hand to other clients or trust client-submitted card state.
