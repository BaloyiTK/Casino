import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Suit = "♠" | "♥" | "♦" | "♣";
type Card = { id: string; suit: Suit; rank: number };
type PlayerRow = { user_id: string; display_name: string; seat: number };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function validateCardLedger(state: Record<string, any>) {
  const suits: Suit[] = ["♠", "♥", "♦", "♣"];
  const expected = new Set(suits.flatMap((suit) =>
    Array.from({ length: 10 }, (_, index) => `${suit}-${index + 1}`)
  ));
  const deck = state.deck as Card[];
  const hands = Object.values(state.hands as Record<string, Card[]>).flat();
  const floor = state.floor as Card[];
  const builds = (state.builds as Array<{ cards: Card[] }>).flatMap((build) => build.cards);
  const captured = Object.values(state.capturedPiles as Record<string, Card[]>).flat();
  const allCards = [...deck, ...hands, ...floor, ...builds, ...captured];
  const ids = allCards.map((card) => card.id);
  if (allCards.length !== 40 || new Set(ids).size !== 40 || ids.some((id) => !expected.has(id))) {
    throw new Error("Card integrity check failed. The move was rejected; all 40 physical cards must exist exactly once.");
  }
  if ([...expected].some((id) => !ids.includes(id))) {
    throw new Error("Card integrity check failed. A physical card is missing.");
  }
}

function dealNextTwoHandsRound(players: PlayerRow[], state: Record<string, any>) {
  const deck = state.deck as Card[];
  const hands = state.hands as Record<string, Card[]>;
  if (deck.length !== 20) throw new Error("Round 2 cannot start: the preserved deck must contain 20 cards.");
  if (Object.values(hands).some((hand) => hand.length !== 0)) {
    throw new Error("Round 2 cannot start until every player's first-round hand is empty.");
  }

  for (let cycle = 0; cycle < 5; cycle++) {
    for (const player of players) {
      for (let count = 0; count < 2; count++) {
        const card = deck.shift();
        if (!card) throw new Error("The preserved deck ran out during the second deal.");
        hands[String(player.seat)].push(card);
      }
    }
  }
  if (Object.values(hands).some((hand) => hand.length !== 10) || deck.length !== 0) {
    throw new Error("Round 2 deal validation failed.");
  }
  state.round = 2;
  state.currentSeat = 1;
  state.phase = "playing";
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

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(authorization.slice(7));
    if (authError || !authData.user) throw new Error("Your player session is invalid. Sign in again.");
    const userId = authData.user.id;

    const body = await request.json();
    const roomId = typeof body.roomId === "string" ? body.roomId : "";
    const action = body.action;
    if (!roomId) throw new Error("A room ID is required.");
    if (action !== "draft" && action !== "end-turn") throw new Error("Unsupported game action.");

    const { data: room, error: roomError } = await admin
      .from("casino_rooms").select("id, game_mode").eq("id", roomId).maybeSingle();
    if (roomError) throw roomError;
    if (!room) throw new Error("Room not found.");

    const { data: playersData, error: playersError } = await admin
      .from("casino_room_players")
      .select("user_id, display_name, seat")
      .eq("room_id", roomId)
      .order("seat");
    if (playersError) throw playersError;
    const players = (playersData ?? []) as PlayerRow[];
    const player = players.find((item) => item.user_id === userId);
    if (!player) throw new Error("You are not a member of this room.");

    const { data: game, error: gameError } = await admin
      .from("casino_games")
      .select("id, game_mode, status, round, current_seat")
      .eq("room_id", roomId)
      .maybeSingle();
    if (gameError) throw gameError;
    if (!game) throw new Error("The host has not started this game.");
    if (game.status !== "playing") throw new Error("This game is complete and no longer accepts actions.");
    if (game.current_seat !== player.seat) throw new Error("It is not your turn.");

    const { data: privateRow, error: privateError } = await admin
      .from("casino_game_private_state")
      .select("state, version")
      .eq("game_id", game.id)
      .single();
    if (privateError) throw privateError;

    const state = JSON.parse(JSON.stringify(privateRow.state)) as Record<string, any>;
    if (state.currentSeat !== player.seat) throw new Error("The game turn is out of sync. Refresh and try again.");
    const hands = state.hands as Record<string, Card[]>;
    const ownHand = hands[String(player.seat)];
    if (!Array.isArray(ownHand)) throw new Error("Your hand is missing from the game state.");

    let nextStatus: "playing" | "round-complete" | "game-complete" = "playing";
    if (action === "draft") {
      const cardId = typeof body.cardId === "string" ? body.cardId : "";
      const index = ownHand.findIndex((card) => card.id === cardId);
      if (index < 0) throw new Error("That card is not in your hand.");
      const [card] = ownHand.splice(index, 1);
      (state.floor as Card[]).push(card);
      state.message = `Seat ${player.seat} drafted a card.`;
    } else {
      const nextSeat = (player.seat % players.length) + 1;
      const allHandsEmpty = Object.values(hands).every((hand) => hand.length === 0);

      if (allHandsEmpty && game.game_mode === "two" && state.round === 1) {
        dealNextTwoHandsRound(players, state);
      } else if (allHandsEmpty && game.game_mode === "two" && state.round === 2) {
        state.phase = "game-complete";
        state.currentSeat = nextSeat;
        nextStatus = "game-complete";
      } else if (allHandsEmpty && game.game_mode === "four") {
        state.phase = "round-complete";
        state.currentSeat = nextSeat;
        nextStatus = "round-complete";
      } else {
        state.currentSeat = nextSeat;
      }
      state.message = nextStatus === "playing" && state.round === 2 && game.round === 1
        ? "Round 1 is complete. The preserved deck has been dealt for Round 2."
        : `Turn passed to seat ${state.currentSeat}.`;
    }

    validateCardLedger(state);

    const { data: newVersion, error: commitError } = await admin.rpc("casino_commit_game_action", {
      p_game_id: game.id,
      p_actor_user_id: userId,
      p_expected_version: privateRow.version,
      p_next_state: state,
      p_next_round: state.round,
      p_next_seat: state.currentSeat,
      p_next_status: nextStatus
    });
    if (commitError) throw commitError;

    const { data: latestState, error: latestError } = await admin
      .from("casino_game_private_state")
      .select("state")
      .eq("game_id", game.id)
      .single();
    if (latestError) throw latestError;

    const currentPlayer = players.find((item) => item.user_id === userId)!;
    const latestHands = latestState.state.hands as Record<string, Card[]>;
    const latestDeck = latestState.state.deck as Card[];
    const latestFloor = latestState.state.floor as Card[];
    const response = {
      gameId: game.id,
      version: newVersion,
      gameMode: game.game_mode,
      round: latestState.state.round,
      currentSeat: latestState.state.currentSeat,
      phase: latestState.state.phase,
      ownSeat: currentPlayer.seat,
      ownHand: latestHands[String(currentPlayer.seat)] ?? [],
      ownHandCount: (latestHands[String(currentPlayer.seat)] ?? []).length,
      opponents: Object.entries(latestHands)
        .filter(([seat]) => Number(seat) !== currentPlayer.seat)
        .map(([seat, hand]) => ({ seat: Number(seat), handCount: hand.length })),
      floor: latestFloor,
      deckCount: latestDeck.length
    };

    return new Response(JSON.stringify(response), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not apply game action.";
    return new Response(JSON.stringify({ error: message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
