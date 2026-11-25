create or replace function public.casino_is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.casino_room_players
    where room_id = p_room_id and user_id = auth.uid()
  );
$$;

revoke all on function public.casino_is_room_member(uuid) from public;
grant execute on function public.casino_is_room_member(uuid) to authenticated;

drop policy if exists "Room members can see the room roster" on public.casino_room_players;
create policy "Room members can see the room roster"
  on public.casino_room_players for select to authenticated
  using (public.casino_is_room_member(room_id));

do $$
begin
  alter publication supabase_realtime add table public.casino_room_players;
exception when duplicate_object then null;
when undefined_object then null;
end $$;
