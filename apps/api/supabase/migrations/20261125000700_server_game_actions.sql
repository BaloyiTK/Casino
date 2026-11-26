alter table public.casino_game_private_state
  add column if not exists version bigint not null default 1;

create or replace function public.casino_commit_game_action(
  p_game_id uuid,
  p_actor_user_id uuid,
  p_expected_version bigint,
  p_next_state jsonb,
  p_next_round smallint,
  p_next_seat smallint,
  p_next_status text
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.casino_games%rowtype;
  v_version bigint;
begin
  select * into v_game
  from public.casino_games
  where id = p_game_id
  for update;

  if not found then raise exception 'Game not found.'; end if;
  if v_game.status <> 'playing' then raise exception 'This game is not accepting actions.'; end if;

  if not exists (
    select 1 from public.casino_room_players rp
    where rp.room_id = v_game.room_id
      and rp.user_id = p_actor_user_id
      and rp.seat = v_game.current_seat
  ) then
    raise exception 'It is not this player''s turn.';
  end if;

  select version into v_version
  from public.casino_game_private_state
  where game_id = p_game_id
  for update;

  if v_version is null then raise exception 'Private game state is missing.'; end if;
  if v_version <> p_expected_version then
    raise exception 'The game changed on another device. Refresh and try again.';
  end if;

  if p_next_round not in (1, 2) then raise exception 'Invalid round.'; end if;
  if p_next_seat < 1 or p_next_seat > 4 then raise exception 'Invalid next player seat.'; end if;
  if p_next_status not in ('playing', 'round-complete', 'game-complete') then
    raise exception 'Invalid game status.';
  end if;

  update public.casino_game_private_state
  set state = p_next_state, version = version + 1, updated_at = now()
  where game_id = p_game_id;

  update public.casino_games
  set round = p_next_round, current_seat = p_next_seat, status = p_next_status
  where id = p_game_id;

  return v_version + 1;
end;
$$;

revoke all on function public.casino_commit_game_action(uuid, uuid, bigint, jsonb, smallint, smallint, text)
from public, anon, authenticated;
grant execute on function public.casino_commit_game_action(uuid, uuid, bigint, jsonb, smallint, smallint, text)
to service_role;
