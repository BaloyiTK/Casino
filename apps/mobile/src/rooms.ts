import { requireSupabaseSession, supabase } from "./supabase";

export type RoomMode = "two" | "four";
export type RoomVisibility = "public" | "private";

export interface RoomSummary {
  room_id: string;
  room_code: string;
  game_mode: RoomMode;
  max_players: number;
  occupied_slots: number;
  status?: string;
  visibility?: RoomVisibility;
  seat?: number;
  players?: Array<{ seat: number; display_name: string; is_host: boolean }>;
}

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function createRoom(
  mode: RoomMode,
  visibility: RoomVisibility,
  displayName: string
): Promise<RoomSummary> {
  await requireSupabaseSession();
  const { data, error } = await client().rpc("casino_create_room", {
    p_game_mode: mode,
    p_visibility: visibility,
    p_display_name: displayName.trim()
  });
  if (error) throw error;
  return data as RoomSummary;
}

export async function joinRoom(code: string, displayName: string): Promise<RoomSummary> {
  await requireSupabaseSession();
  const { data, error } = await client().rpc("casino_join_room", {
    p_room_code: code.trim().toUpperCase(),
    p_display_name: displayName.trim()
  });
  if (error) throw error;
  return data as RoomSummary;
}

export async function listPublicRooms(): Promise<RoomSummary[]> {
  await requireSupabaseSession();
  const { data, error } = await client().rpc("casino_list_public_rooms");
  if (error) throw error;
  return (data ?? []) as RoomSummary[];
}

export function watchRoom(roomId: string, onChange: () => void) {
  const channel = client()
    .channel(`casino-room-${roomId}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "casino_rooms",
      filter: `id=eq.${roomId}`
    }, onChange)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "casino_room_players",
      filter: `room_id=eq.${roomId}`
    }, onChange)
    .subscribe();

  return () => {
    void client().removeChannel(channel);
  };
}

export async function getRoom(roomId: string): Promise<RoomSummary> {
  await requireSupabaseSession();
  const { data, error } = await client().rpc("casino_get_room", {
    p_room_id: roomId
  });
  if (error) throw error;
  return data as RoomSummary;
}
