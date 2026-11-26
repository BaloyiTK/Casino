export { isSupabaseConfigured } from "./supabase";
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
  players?: Array<{ seat: number; display_name: string; is_host: boolean; is_me?: boolean }>;
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

export interface OnlineGameSession {
  gameId: string;
  version: number;
  gameMode: RoomMode;
  round: number;
  currentSeat: number;
  phase: string;
  ownSeat: number;
  ownHand: Array<{ id: string; suit: string; rank: number }>;
  ownHandCount: number;
  opponents: Array<{ seat: number; handCount: number }>;
  floor: Array<{ id: string; suit: string; rank: number }>;
  builds: Array<{ id: string; value: number; ownerSeat: number; team: number; cards: Array<{ id: string; suit: string; rank: number }> }>;
  capturedPiles: Array<{ seat: number; count: number; topCard: { id: string; suit: string; rank: number } | null }>;
  ownershipRequests: Array<{ id: string; buildId: string; requesterSeat: number; ownerSeat: number; status: "pending" | "approved" | "rejected" | "cancelled" }>;
  recoverableBuilds: Array<{ id: string; value: number; originalOwnerSeat: number; originalTeam: number; capturedBySeat: number; partnerRecoveryBlocked: boolean }>;
  deckCount: number;
}

export async function getGameSession(
  roomId: string,
  action: "start" | "get" = "get"
): Promise<OnlineGameSession> {
  await requireSupabaseSession();
  const { data, error } = await client().functions.invoke("game-session", {
    body: { roomId, action }
  });
  if (error) {
    const details = data && typeof data === "object" && "error" in data
      ? String((data as { error: unknown }).error)
      : error.message;
    throw new Error(details);
  }
  return data as OnlineGameSession;
}

export async function applyGameAction(
  roomId: string,
  action: "draft" | "end-turn" | "create-build" | "top-up-build" | "capture-build" | "capture-loose" | "recover-build" | "shiya" | "request-build-transfer" | "approve-build-transfer" | "reject-build-transfer",
  cardId?: string,
  combination?: { handCardIds: string[]; floorCardIds: string[]; opponentPileCardIds: string[] },
  buildId?: string,
  targetCardId?: string,
  capturedBuildId?: string
): Promise<OnlineGameSession> {
  await requireSupabaseSession();
  const { data, error } = await client().functions.invoke("game-action", {
    body: { roomId, action, cardId, buildId, targetCardId, capturedBuildId, ...(combination ?? {}) }
  });
  if (error) {
    const details = data && typeof data === "object" && "error" in data
      ? String((data as { error: unknown }).error)
      : error.message;
    throw new Error(details);
  }
  return data as OnlineGameSession;
}
