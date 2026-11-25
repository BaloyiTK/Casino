create or replace function public.casino_get_room(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_room public.casino_rooms%rowtype;
  v_players jsonb;
  v_count integer;
begin
  if v_user is null then raise exception 'Sign in is required.'; end if;
  select * into v_room from public.casino_rooms where id = p_room_id;
  if not found then raise exception 'Room not found.'; end if;
  if not exists (
    select 1 from public.casino_room_players
    where room_id = p_room_id and user_id = v_user
  ) then raise exception 'You are not a member of this room.'; end if;

  select count(*) into v_count from public.casino_room_players where room_id = p_room_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'seat', seat, 'display_name', display_name, 'is_host', user_id = v_room.host_user_id
  ) order by seat), '[]'::jsonb)
  into v_players
  from public.casino_room_players where room_id = p_room_id;

  return jsonb_build_object(
    'room_id', v_room.id, 'room_code', v_room.room_code,
    'game_mode', v_room.game_mode, 'visibility', v_room.visibility,
    'max_players', v_room.max_players, 'occupied_slots', v_count,
    'status', v_room.status, 'players', v_players
  );
end;
$$;

revoke all on function public.casino_get_room(uuid) from public;
grant execute on function public.casino_get_room(uuid) to authenticated;
