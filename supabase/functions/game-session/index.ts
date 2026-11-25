import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Suit = "♠" | "♥" | "♦" | "♣";
type Card = { id: string; suit: Suit; rank: number };
type PlayerRow = { user_id: string; display_name: string; seat: number };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function secureRandomUint32(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0];
}

function secureShuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const range = i + 1;
    const limit = Math.floor(0x100000000 / range) * range;
    let value = secureRandomUint32();
    while (value >= limit) value = secureRandomUint32();
    const j = value % range;
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function createShuffledDeck(): Card[] {
  const suits: Suit[] = ["♠", "♥", "♦", "♣"];
  const shuffledSuits = suits.flatMap((suit) =>
    secureShuffle(Array.from({ length: 10 }, (_, index) => ({
      id: `${suit}-${index + 1}`,
      suit,
      rank: index + 1
    })))
  );
  return secureShuffle(shuffledSuits);
}

function dealInitialHands(players: PlayerRow[], deck: Card[]) {
  const hands: Record<string, Card[]> = Object.fromEntries(
    players.map((player) => [String(player.seat), []])
  );
  for (let cycle = 0; cycle < 5; cycle++) {
    for (const player of players) {
      for (let count = 0; count < 2; count++) {
        const card = deck.shift();
        if (!card) throw new Error("The deck ran out during dealing.");
        hands[String(player.seat)].push(card);
      }
    }
  }
  if (Object.values(hands).some((hand) => hand.length !== 10)) {
    throw new Error("Initial deal validation failed: every player must receive 10 cards.");
  }
  if (new Set(Object.values(hands).flat().map((card) => card.id)).size !== players.length * 10) {
    throw new Error("Initial deal validation failed: duplicate cards were dealt.");
  }
  return hands;
}

function publicSession(state: Record<string, unknown>, player: PlayerRow, game: Record<string, unknown>) {
  const hands = state.hands as Record<string, Card[]>;
  const deck = state.deck as Card[];
  const floor = state.floor as Card[];
  return {
    gameId: game.id,
    gameMode: game.game_mode,
    round: state.round,
    currentSeat: state.currentSeat,
    phase: state.phase,
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

    const ownPlayer = (players ?? []).find((player: PlayerRow) => player.user_id === userId) as PlayerRow | undefined;
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
      if (players.length !== room.max_players) throw new Error("Wait until every player slot is filled.");

      const deck = createShuffledDeck();
      const hands = dealInitialHands(players as PlayerRow[], deck);
      const privateState = {
        gameMode: room.game_mode,
        deck,
        hands,
        floor: [],
        builds: [],
        capturedPiles: Object.fromEntries((players as PlayerRow[]).map((p) => [String(p.seat), []])),
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
      .select("state")
      .eq("game_id", game.id)
      .single();
    if (privateError) throw privateError;

    const response = publicSession(privateRow.state as Record<string, unknown>, ownPlayer, game);
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
