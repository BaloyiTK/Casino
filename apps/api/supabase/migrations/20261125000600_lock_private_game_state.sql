-- The full deck and all players' hands must never be readable from mobile clients.
revoke all on table public.casino_game_private_state from anon, authenticated;
grant all on table public.casino_game_private_state to service_role;

-- Client access to game metadata remains read-only and is filtered by the member RLS policy.
revoke insert, update, delete, truncate, references, trigger
on table public.casino_games from anon, authenticated;
