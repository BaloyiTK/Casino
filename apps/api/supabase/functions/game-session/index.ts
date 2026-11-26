/// <reference lib="deno.ns" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createValidatedInitialDeal, type Card } from "../_shared/shuffle-deal.ts";

type PlayerRow = { user_id: string; display_name: string; seat: number };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function publicSession(state: Record<string, unknown>, player: PlayerRow, game: Record<string, unknown>, version: number) {
  const hands = state.hands as Record<string, Card[]>;
  const deck = state.deck as Card[];
  const floor = state.floor as Card[];
  return {
    gameId: game.id,
    version,
    gameMode: game.game_mode,
    round: state.round,
    currentSeat: state.currentSeat,
    phase: state.phase,
    message: typeof state.message === "string" ? state.message : "",
    forfeit: state.forfeit ?? null,
    ownSeat: player.seat,
    ownHand: hands[String(player.seat)] ?? [],
    ownHandCount: (hands[String(player.seat)] ?? []).length,
    opponents: Object.entries(hands)
      .filter(([seat]) => Number(seat) !== player.seat)
      .map(([seat, hand]) => ({
        seat: Number(seat),
        handCount: hand.length
      })),
    floor,
    builds: (state.builds as Array<{ id: string; value: number; ownerSeat: number; team: number; cards: Card[] }>).map((build) => ({ id: build.id, value: build.value, ownerSeat: build.ownerSeat, team: build.team, cards: build.cards })),
    capturedPiles: Object.entries(state.capturedPiles as Record<string, Card[]>).map(([seat, pile]) => ({ seat: Number(seat), count: pile.length, topCard: pile.length ? pile[pile.length - 1] : null })),
    ownershipRequests: state.ownershipRequests ?? [],
    recoverableBuilds: ((state.recoverableBuilds ?? []) as Array<Record<string, unknown>>).filter((item) => item.status === "captured"),
    deckCount: deck.length
  };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new Error("Server Supabase environment is not configured.");

    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) throw new Error("Sign in is required.");
    const token = authorization.slice("Bearer ".length);
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) throw new Error("Your player session is invalid. Sign in again.");
    const userId = authData.user.id;

    const body = await request.json();
    const roomId = typeof body.roomId === "string" ? body.roomId : "";
    const action = body.action === "start" ? "start" : "get";
    if (!roomId) throw new Error("A room ID is required.");

    const { data: room, error: roomError } = await admin
      .from("casino_rooms")
      .select("id, room_code, game_mode, visibility, host_user_id, status, max_players")
      .eq("id", roomId)
      .maybeSingle();
    if (roomError) throw roomError;
    if (!room) throw new Error("Room not found.");

    const { data: players, error: playersError } = await admin
      .from("casino_room_players")
      .select("user_id, display_name, seat")
      .eq("room_id", roomId)
      .order("seat");
    if (playersError) throw playersError;
    const roomPlayers = (players ?? []) as PlayerRow[];

    const ownPlayer = roomPlayers.find((player) => player.user_id === userId);
    if (!ownPlayer) throw new Error("You are not a member of this room.");

    let { data: game, error: gameError } = await admin
      .from("casino_games")
      .select("id, game_mode, status, round, current_seat")
      .eq("room_id", roomId)
      .maybeSingle();
    if (gameError) throw gameError;

    if (!game && action === "start") {
      if (room.host_user_id !== userId) throw new Error("Only the room host can start the game.");
      if (room.status !== "waiting") throw new Error("This room is not waiting to start.");
      if (roomPlayers.length !== room.max_players) throw new Error("Wait until every player slot is filled.");

      const orderedPlayers = roomPlayers;
      if (orderedPlayers.length !== room.max_players ||
          orderedPlayers.some((player, index) => player.seat !== index + 1)) {
        throw new Error("Room seats are incomplete. Wait until every player has joined.");
      }
      const { deck, hands } = createValidatedInitialDeal(orderedPlayers, orderedPlayers.length);
      const privateState = {
        gameMode: room.game_mode,
        deck,
        hands,
        floor: [],
        builds: [],
        capturedPiles: Object.fromEntries(orderedPlayers.map((p) => [String(p.seat), []])),
        recoverableBuilds: [],
        round: 1,
        currentSeat: 1,
        roundStarter: 1,
        phase: "playing"
      };

      const { data: gameId, error: startError } = await admin.rpc("casino_commit_game_start", {
        p_room_id: roomId,
        p_host_user_id: userId,
        p_game_state: privateState
      });
      if (startError) throw startError;

      const { data: refreshedGame, error: refreshedError } = await admin
        .from("casino_games")
        .select("id, game_mode, status, round, current_seat")
        .eq("id", gameId)
        .single();
      if (refreshedError) throw refreshedError;
      game = refreshedGame;
    }

    if (!game) throw new Error("The host has not started this game yet.");

    const { data: privateRow, error: privateError } = await admin
      .from("casino_game_private_state")
      .select("state, version")
      .eq("game_id", game.id)
      .single();
    if (privateError) throw privateError;

    const response = publicSession(privateRow.state as Record<string, unknown>, ownPlayer, game, privateRow.version);
    return new Response(JSON.stringify(response), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load the game session.";
    return new Response(JSON.stringify({ error: message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
