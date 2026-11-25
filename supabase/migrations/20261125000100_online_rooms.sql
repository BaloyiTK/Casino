create extension if not exists pgcrypto;

create table if not exists public.casino_rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  game_mode text not null check (game_mode in ('two', 'four')),
  visibility text not null check (visibility in ('public', 'private')),
  host_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'completed', 'cancelled')),
  max_players smallint not null check (max_players in (2, 4)),
  created_at timestamptz not null default now()
);

create table if not exists public.casino_room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.casino_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  seat smallint not null check (seat between 1 and 4),
  joined_at timestamptz not null default now(),
  unique (room_id, user_id),
  unique (room_id, seat)
);

create index if not exists casino_rooms_lobby_idx
  on public.casino_rooms (visibility, status, created_at desc);
create index if not exists casino_room_players_room_idx
  on public.casino_room_players (room_id);

alter table public.casino_rooms enable row level security;
alter table public.casino_room_players enable row level security;

drop policy if exists "Public rooms and own rooms are readable" on public.casino_rooms;
create policy "Public rooms and own rooms are readable"
  on public.casino_rooms for select to authenticated
  using (
    visibility = 'public'
    or host_user_id = auth.uid()
    or exists (
      select 1 from public.casino_room_players rp
      where rp.room_id = casino_rooms.id and rp.user_id = auth.uid()
    )
  );

drop policy if exists "Players can read their own seat" on public.casino_room_players;
create policy "Players can read their own seat"
  on public.casino_room_players for select to authenticated
  using (user_id = auth.uid());

create or replace function public.casino_create_room(
  p_game_mode text,
  p_visibility text,
  p_display_name text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_room public.casino_rooms%rowtype;
  v_code text;
  v_capacity smallint;
begin
  if v_user is null then raise exception 'Sign in is required.'; end if;
  if p_game_mode not in ('two', 'four') then raise exception 'Invalid game mode.'; end if;
  if p_visibility not in ('public', 'private') then raise exception 'Invalid room visibility.'; end if;
  if p_display_name is null or char_length(trim(p_display_name)) not between 1 and 24 then
    raise exception 'Display name must be 1 to 24 characters.';
  end if;

  v_capacity := case when p_game_mode = 'two' then 2 else 4 end;
  loop
    v_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 6));
    exit when not exists (select 1 from public.casino_rooms where room_code = v_code);
  end loop;

  insert into public.casino_rooms(room_code, game_mode, visibility, host_user_id, max_players)
  values (v_code, p_game_mode, p_visibility, v_user, v_capacity)
  returning * into v_room;

  insert into public.casino_room_players(room_id, user_id, display_name, seat)
  values (v_room.id, v_user, trim(p_display_name), 1);

  return jsonb_build_object(
    'room_id', v_room.id, 'room_code', v_room.room_code,
    'game_mode', v_room.game_mode, 'visibility', v_room.visibility,
    'max_players', v_room.max_players, 'occupied_slots', 1, 'status', v_room.status
  );
end;
$$;

create or replace function public.casino_join_room(
  p_room_code text,
  p_display_name text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_room public.casino_rooms%rowtype;
  v_seat smallint;
  v_count integer;
begin
  if v_user is null then raise exception 'Sign in is required.'; end if;
  if p_display_name is null or char_length(trim(p_display_name)) not between 1 and 24 then
    raise exception 'Display name must be 1 to 24 characters.';
  end if;

  select * into v_room from public.casino_rooms
  where room_code = upper(trim(p_room_code))
  for update;

  if not found then raise exception 'Room not found. Check the code and try again.'; end if;
  if v_room.status <> 'waiting' then raise exception 'This room is no longer accepting players.'; end if;

  if exists (select 1 from public.casino_room_players where room_id = v_room.id and user_id = v_user) then
    select seat into v_seat from public.casino_room_players where room_id = v_room.id and user_id = v_user;
  else
    select count(*) into v_count from public.casino_room_players where room_id = v_room.id;
    if v_count >= v_room.max_players then raise exception 'This room is full.'; end if;
    select candidate into v_seat
    from generate_series(1, v_room.max_players) candidate
    where not exists (
      select 1 from public.casino_room_players rp
      where rp.room_id = v_room.id and rp.seat = candidate
    )
    order by candidate limit 1;

    insert into public.casino_room_players(room_id, user_id, display_name, seat)
    values (v_room.id, v_user, trim(p_display_name), v_seat);
  end if;

  select count(*) into v_count from public.casino_room_players where room_id = v_room.id;
  return jsonb_build_object(
    'room_id', v_room.id, 'room_code', v_room.room_code,
    'game_mode', v_room.game_mode, 'visibility', v_room.visibility,
    'max_players', v_room.max_players, 'occupied_slots', v_count,
    'status', v_room.status, 'seat', v_seat
  );
end;
$$;

create or replace function public.casino_list_public_rooms()
returns table (
  room_id uuid,
  room_code text,
  game_mode text,
  max_players smallint,
  occupied_slots bigint,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select r.id, r.room_code, r.game_mode, r.max_players,
         count(p.id) as occupied_slots, r.created_at
  from public.casino_rooms r
  left join public.casino_room_players p on p.room_id = r.id
  where r.visibility = 'public' and r.status = 'waiting'
  group by r.id
  having count(p.id) < r.max_players
  order by r.created_at desc;
$$;

revoke all on function public.casino_create_room(text, text, text) from public;
revoke all on function public.casino_join_room(text, text) from public;
revoke all on function public.casino_list_public_rooms() from public;
grant execute on function public.casino_create_room(text, text, text) to authenticated;
grant execute on function public.casino_join_room(text, text) to authenticated;
grant execute on function public.casino_list_public_rooms() to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.casino_rooms;
exception when duplicate_object then null;
when undefined_object then null;
end $$;
