create table if not exists public.casino_games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null unique references public.casino_rooms(id) on delete cascade,
  game_mode text not null check (game_mode in ('two', 'four')),
  status text not null default 'playing' check (status in ('playing', 'round-complete', 'game-complete')),
  round smallint not null default 1 check (round in (1, 2)),
  current_seat smallint not null default 1 check (current_seat between 1 and 4),
  created_at timestamptz not null default now()
);

-- Full deck order, every hand, and all card locations live only in this server-only table.
create table if not exists public.casino_game_private_state (
  game_id uuid primary key references public.casino_games(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.casino_games enable row level security;
alter table public.casino_game_private_state enable row level security;

drop policy if exists "Room members can read game metadata" on public.casino_games;
create policy "Room members can read game metadata"
  on public.casino_games for select to authenticated
  using (public.casino_is_room_member(room_id));

-- Intentionally no client policies on casino_game_private_state.
-- Only the service-role Edge Function may read or write the complete game state.

create or replace function public.casino_commit_game_start(
  p_room_id uuid,
  p_host_user_id uuid,
  p_game_state jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.casino_rooms%rowtype;
  v_game_id uuid;
  v_player_count integer;
begin
  select * into v_room
  from public.casino_rooms
  where id = p_room_id
  for update;

  if not found then raise exception 'Room not found.'; end if;
  if v_room.host_user_id <> p_host_user_id then raise exception 'Only the host can start this game.'; end if;

  select id into v_game_id from public.casino_games where room_id = p_room_id;
  if v_game_id is not null then return v_game_id; end if;

  if v_room.status <> 'waiting' then raise exception 'This room is not waiting to start.'; end if;
  select count(*) into v_player_count from public.casino_room_players where room_id = p_room_id;
  if v_player_count <> v_room.max_players then
    raise exception 'The room must be full before the game can start.';
  end if;

  if p_game_state->>'gameMode' is distinct from v_room.game_mode then
    raise exception 'Game mode does not match the room.';
  end if;

  insert into public.casino_games(room_id, game_mode, status, round, current_seat)
  values (p_room_id, v_room.game_mode, 'playing', 1, 1)
  returning id into v_game_id;

  insert into public.casino_game_private_state(game_id, state)
  values (v_game_id, p_game_state);

  update public.casino_rooms set status = 'playing' where id = p_room_id;
  return v_game_id;
end;
$$;

revoke all on function public.casino_commit_game_start(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.casino_commit_game_start(uuid, uuid, jsonb) to service_role;

do $$
begin
  alter publication supabase_realtime add table public.casino_games;
exception when duplicate_object then null;
when undefined_object then null;
end $$;
