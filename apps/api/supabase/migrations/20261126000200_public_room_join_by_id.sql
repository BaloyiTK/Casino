create or replace function public.casino_join_public_room(
  p_room_id uuid,
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
  where id = p_room_id
  for update;

  if not found then raise exception 'Public room not found.'; end if;
  if v_room.visibility <> 'public' then raise exception 'This room is not public. Use its invite code.'; end if;
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

revoke all on function public.casino_join_public_room(uuid, text) from public;
grant execute on function public.casino_join_public_room(uuid, text) to authenticated;
