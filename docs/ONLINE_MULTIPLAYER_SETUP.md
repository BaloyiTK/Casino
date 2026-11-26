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
8. `20261125000800_partner_transfer_actions.sql`

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

## Implemented functionality

- Public and private rooms for Two Hands (2 players) and Four Hands (4 players), with room codes and server-side seat assignment.
- Server-side cryptographically secure deck generation: shuffle each suit independently, combine in suit order, then shuffle the complete 40-card deck.
- Two-card-at-a-time dealing in player order. Two Hands Round 2 continues from the preserved remaining deck without reshuffling.
- Private server-side game state. Each player receives only their own hand; opponents' card identities and the remaining deck stay private.
- Drafting loose cards onto the floor.
- Server-validated build creation using the player's hand, loose floor cards, and eligible visible top cards from opposing captured piles.
- Partner build top-ups, build capture, direct loose-card capture, and captured-pile top-card visibility.
- Shiya ownership transfer and its forced-capture/forfeit handling.
- Partner build ownership requests with approve/decline actions.
- Turn passing and Two Hands Round 2 dealing.
- Last successful capturer receives remaining loose floor cards when play ends.
- Card-ledger and active-build invariant validation, with automated Deno tests.
- Version checks and database row locks protect game-state mutations against stale concurrent actions.

## Still outstanding before a complete playable match

- Recovery is not implemented because the exact turn/timing when recovery may be attempted is explicitly unspecified in `docs/rules/LOCKED_RULES.md`. The confirmed ownership and combination rules are documented there; no timing has been invented.
- Final scoring is not implemented. The calculation for the combined 20+ category and the Big 10 dice procedure/condition remain unspecified.
- A complete Four Hands match-end/scoring flow still needs to be added after the round-complete state.
- Supabase project configuration, migration application, Edge Function deployment, and real-device multiplayer testing have not yet been completed or verified.

Do not add client-side card-state mutations. Never broadcast a player's hand to other clients or trust client-submitted card state.
