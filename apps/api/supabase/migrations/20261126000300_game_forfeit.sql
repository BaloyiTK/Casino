create or replace function public.casino_commit_game_forfeit(
  p_game_id uuid,
  p_actor_user_id uuid,
  p_expected_version bigint,
  p_next_state jsonb
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.casino_games%rowtype;
  v_room_id uuid;
  v_version bigint;
begin
  select * into v_game
  from public.casino_games
  where id = p_game_id
  for update;

  if not found then raise exception 'Game not found.'; end if;
  if v_game.status <> 'playing' then raise exception 'This match is no longer active.'; end if;

  if not exists (
    select 1 from public.casino_room_players rp
    where rp.room_id = v_game.room_id
      and rp.user_id = p_actor_user_id
  ) then
    raise exception 'Only a player in this match can forfeit it.';
  end if;

  select version into v_version
  from public.casino_game_private_state
  where game_id = p_game_id
  for update;

  if v_version is null then raise exception 'Private game state is missing.'; end if;
  if v_version <> p_expected_version then
    raise exception 'The game changed on another device. Refresh and try again.';
  end if;
  if p_next_state->>'phase' is distinct from 'game-complete'
     or p_next_state->'forfeit' is null then
    raise exception 'A valid forfeit result is required.';
  end if;

  update public.casino_game_private_state
  set state = p_next_state, version = version + 1, updated_at = now()
  where game_id = p_game_id;

  update public.casino_games
  set status = 'game-complete'
  where id = p_game_id;

  update public.casino_rooms
  set status = 'completed'
  where id = v_game.room_id;

  return v_version + 1;
end;
$$;

revoke all on function public.casino_commit_game_forfeit(uuid, uuid, bigint, jsonb)
from public, anon, authenticated;
grant execute on function public.casino_commit_game_forfeit(uuid, uuid, bigint, jsonb)
to service_role;
