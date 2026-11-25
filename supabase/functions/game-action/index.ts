/// <reference lib="deno.ns" />
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
  if (Object.values(hands).some((hand) => hand.length !== 10) || Number(deck.length) !== 0) {
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
    if (action !== "draft" && action !== "end-turn" && action !== "create-build" && action !== "top-up-build" && action !== "capture-build" && action !== "capture-loose" && action !== "shiya" && action !== "request-build-transfer" && action !== "approve-build-transfer" && action !== "reject-build-transfer") throw new Error("Unsupported game action.");

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
    if (game.current_seat !== player.seat && !["request-build-transfer", "approve-build-transfer", "reject-build-transfer"].includes(action)) throw new Error("It is not your turn.");

    const { data: privateRow, error: privateError } = await admin
      .from("casino_game_private_state")
      .select("state, version")
      .eq("game_id", game.id)
      .single();
    if (privateError) throw privateError;

    const state = JSON.parse(JSON.stringify(privateRow.state)) as Record<string, any>;
    if (state.currentSeat !== player.seat && !["request-build-transfer", "approve-build-transfer", "reject-build-transfer"].includes(action)) throw new Error("The game turn is out of sync. Refresh and try again.");
    const hands = state.hands as Record<string, Card[]>;
    const ownHand = hands[String(player.seat)];
    if (!Array.isArray(ownHand)) throw new Error("Your hand is missing from the game state.");

    let nextStatus: "playing" | "round-complete" | "game-complete" = "playing";
    if (state.shiyaPending && action !== "capture-build") {
      const pending = state.shiyaPending as { seat: number; team: number; buildIds: string[] };
      if (pending.seat !== player.seat) throw new Error("Only the player who performed Shiya may complete that turn.");
      state.phase = "game-complete";
      state.forfeit = { losingTeam: pending.team, winningTeam: pending.team === 1 ? 2 : 1, pointsAwarded: 11, reason: "Shiya capture requirement not completed." };
      state.message = `Team ${state.forfeit.winningTeam} wins all 11 points: the Shiya player did not capture one of the two builds.`;
      nextStatus = "game-complete";
    } else if (action === "request-build-transfer" || action === "approve-build-transfer" || action === "reject-build-transfer") {
      if (players.length !== 4) throw new Error("Partner ownership requests are only available in Four Hands.");
      const buildId = typeof body.buildId === "string" ? body.buildId : "";
      const builds = state.builds as Array<{ id: string; value: number; ownerSeat: number; team: number; cards: Card[] }>;
      const build = builds.find((item) => item.id === buildId);
      if (!build) throw new Error("That build is no longer active.");
      const teamOf = (seat: number) => seat % 2 === 1 ? 1 : 2;
      const requests = (state.ownershipRequests ?? []) as Array<{ id: string; buildId: string; requesterSeat: number; ownerSeat: number; status: string }>;
      if (action === "request-build-transfer") {
        if (build.ownerSeat === player.seat || build.team !== teamOf(player.seat)) throw new Error("You can only request a build owned by your partner.");
        if (builds.some((item) => item.ownerSeat === player.seat)) throw new Error("You already own an active build. The ordinary transfer rule does not allow a second build.");
        if (requests.some((request) => request.buildId === buildId && request.status === "pending")) throw new Error("A transfer request is already pending for this build.");
        requests.push({ id: crypto.randomUUID(), buildId, requesterSeat: player.seat, ownerSeat: build.ownerSeat, status: "pending" });
        state.ownershipRequests = requests;
        state.message = "Seat " + player.seat + " requested ownership of their partner build.";
      } else {
        const requestIndex = requests.findIndex((request) => request.buildId === buildId && request.status === "pending" && request.ownerSeat === player.seat);
        if (requestIndex < 0) throw new Error("There is no pending request for this build that you own.");
        if (action === "approve-build-transfer") {
          build.ownerSeat = requests[requestIndex].requesterSeat;
          requests[requestIndex].status = "approved";
          state.message = "Seat " + player.seat + " approved the ownership transfer.";
        } else {
          requests[requestIndex].status = "rejected";
          state.message = "Seat " + player.seat + " declined the ownership transfer.";
        }
        state.ownershipRequests = requests;
      }
    } else if (action === "draft") {
      const cardId = typeof body.cardId === "string" ? body.cardId : "";
      const index = ownHand.findIndex((card) => card.id === cardId);
      if (index < 0) throw new Error("That card is not in your hand.");
      const [card] = ownHand.splice(index, 1);
      (state.floor as Card[]).push(card);
      state.message = `Seat ${player.seat} drafted a card.`;
    } else if (action === "create-build") {
      const handCardIds: string[] = Array.isArray(body.handCardIds) ? body.handCardIds.filter((id: unknown): id is string => typeof id === "string") : [];
      const floorCardIds: string[] = Array.isArray(body.floorCardIds) ? body.floorCardIds.filter((id: unknown): id is string => typeof id === "string") : [];
      const opponentPileCardIds: string[] = Array.isArray(body.opponentPileCardIds) ? body.opponentPileCardIds.filter((id: unknown): id is string => typeof id === "string") : [];
      const allSelectedIds = [...handCardIds, ...floorCardIds, ...opponentPileCardIds];
      if (allSelectedIds.length === 0 || new Set(allSelectedIds).size !== allSelectedIds.length) {
        throw new Error("Select a valid combination of different cards.");
      }
      if (handCardIds.length === 0) throw new Error("A build must include at least one card from your own hand.");
      const builds = state.builds as Array<{ id: string; value: number; ownerSeat: number; team: number; cards: Card[] }>;
      const floor = state.floor as Card[];
      if (builds.some((build) => build.ownerSeat === player.seat)) {
        throw new Error("You already own an active build.");
      }

      const selectedHand = handCardIds.map((id) => {
        const index = ownHand.findIndex((card) => card.id === id);
        if (index < 0) throw new Error("A selected hand card is not in your hand.");
        return ownHand[index];
      });
      const selectedFloor = floorCardIds.map((id) => {
        const index = floor.findIndex((card) => card.id === id);
        if (index < 0) throw new Error("A selected floor card is not loose or available.");
        return floor[index];
      });

      const capturedPiles = state.capturedPiles as Record<string, Card[]>;
      const activeBuildExists = builds.length > 0;
      if (opponentPileCardIds.length > 0 && !activeBuildExists) {
        throw new Error("Opponent captured-pile cards may only be used when an active build already exists.");
      }
      const selectedOpponentPile: Card[] = [];
      for (const id of opponentPileCardIds) {
        let found: Card | undefined;
        for (const [seatText, pile] of Object.entries(capturedPiles)) {
          const pileSeat = Number(seatText);
          const isOpponent = players.length === 2
            ? pileSeat !== player.seat
            : (pileSeat % 2) !== (player.seat % 2);
          const top = pile[pile.length - 1];
          if (isOpponent && top?.id === id) {
            found = top;
            break;
          }
        }
        if (!found) throw new Error("Only the visible top card of an opponent's captured pile may be used.");
        selectedOpponentPile.push(found);
      }

      const value = [...selectedHand, ...selectedFloor, ...selectedOpponentPile]
        .reduce((total, card) => total + card.rank, 0);
      if (value < 1 || value > 10) throw new Error("A build value must be between 1 and 10.");
      if (floor.some((card) => card.rank === value)) {
        throw new Error("A loose floor card already represents that value.");
      }
      if (builds.some((build) => build.value === value)) {
        throw new Error("An active build already has that value.");
      }

      for (const id of handCardIds) ownHand.splice(ownHand.findIndex((card) => card.id === id), 1);
      for (const id of floorCardIds) floor.splice(floor.findIndex((card) => card.id === id), 1);
      for (const id of opponentPileCardIds) {
        const pile = Object.values(capturedPiles).find((cards) => cards[cards.length - 1]?.id === id);
        if (!pile) throw new Error("An opponent pile changed while creating the build.");
        pile.pop();
      }
      builds.push({
        id: crypto.randomUUID(),
        value,
        ownerSeat: player.seat,
        team: players.length === 2 ? player.seat : (player.seat % 2 === 1 ? 1 : 2),
        cards: [...selectedHand, ...selectedFloor, ...selectedOpponentPile]
      });
      state.message = `Seat ${player.seat} created a build worth ${value}.`;
    } else if (action === "shiya") {
      if (players.length !== 4) throw new Error("Shiya is only available in Four Hands.");
      const buildId = typeof body.buildId === "string" ? body.buildId : "";
      const builds = state.builds as Array<{ id: string; value: number; ownerSeat: number; team: number; cards: Card[] }>;
      const build = builds.find((item) => item.id === buildId);
      const playerTeam = player.seat % 2 === 1 ? 1 : 2;
      if (!build || build.team !== playerTeam || build.ownerSeat === player.seat) throw new Error("Shiya requires an active build individually owned by your partner.");
      if (state.shiyaPending) throw new Error("A Shiya capture requirement is already active.");
      const alreadyOwnsBuild = builds.some((item) => item.ownerSeat === player.seat);
      if (alreadyOwnsBuild && builds.filter((item) => item.ownerSeat === player.seat).length !== 1) throw new Error("You cannot Shiya while already owning two builds.");
      build.ownerSeat = player.seat;
      if (alreadyOwnsBuild) {
        state.shiyaPending = { seat: player.seat, team: playerTeam, buildIds: builds.filter((item) => item.ownerSeat === player.seat).map((item) => item.id) };
      }
      state.message = alreadyOwnsBuild ? `Seat ${player.seat} Shiya transferred the partner build. Capture one of your two builds now to finish your turn.` : `Seat ${player.seat} Shiya transferred the partner build.`;
    } else if (action === "capture-build") {
      const buildId = typeof body.buildId === "string" ? body.buildId : "";
      const handCardIds: string[] = Array.isArray(body.handCardIds)
        ? body.handCardIds.filter((id: unknown): id is string => typeof id === "string")
        : [];
      const floorCardIds: string[] = Array.isArray(body.floorCardIds)
        ? body.floorCardIds.filter((id: unknown): id is string => typeof id === "string")
        : [];
      const opponentPileCardIds: string[] = Array.isArray(body.opponentPileCardIds)
        ? body.opponentPileCardIds.filter((id: unknown): id is string => typeof id === "string")
        : [];
      const selectedIds = [...handCardIds, ...floorCardIds, ...opponentPileCardIds];
      if (!buildId || handCardIds.length === 0 || selectedIds.length !== new Set(selectedIds).size) {
        throw new Error("A build capture needs at least one hand card and a unique valid combination.");
      }
      const builds = state.builds as Array<{ id: string; value: number; ownerSeat: number; team: number; cards: Card[] }>;
      const buildIndex = builds.findIndex((item) => item.id === buildId);
      if (buildIndex < 0) throw new Error("That build is no longer active.");
      const targetBuild = builds[buildIndex];
      const playerTeam = players.length === 2 ? player.seat : (player.seat % 2 === 1 ? 1 : 2);
      if (players.length === 4 && targetBuild.ownerSeat !== player.seat && targetBuild.team === playerTeam) {
        throw new Error("You cannot capture your partner's build while your partner owns it. Use the approved ownership-transfer rule first.");
      }
      const floor = state.floor as Card[];
      const selectedHand = handCardIds.map((id) => {
        const card = ownHand.find((item) => item.id === id);
        if (!card) throw new Error("A selected capture card is not in your hand.");
        return card;
      });
      const selectedFloor = floorCardIds.map((id) => {
        const card = floor.find((item) => item.id === id);
        if (!card) throw new Error("A selected floor card is not loose or available.");
        return card;
      });
      const capturedPiles = state.capturedPiles as Record<string, Card[]>;
      const selectedOpponentPile: Card[] = [];
      for (const id of opponentPileCardIds) {
        let found: Card | undefined;
        for (const [seatText, pile] of Object.entries(capturedPiles)) {
          const pileSeat = Number(seatText);
          const pileTeam = players.length === 2 ? pileSeat : (pileSeat % 2 === 1 ? 1 : 2);
          const top = pile[pile.length - 1];
          if (pileTeam !== playerTeam && top?.id === id) {
            found = top;
            break;
          }
        }
        if (!found) throw new Error("Only visible top cards from opponents' captured piles may be used.");
        selectedOpponentPile.push(found);
      }
      const total = [...selectedHand, ...selectedFloor, ...selectedOpponentPile]
        .reduce((sum, card) => sum + card.rank, 0);
      if (total !== targetBuild.value) {
        throw new Error(`The capture combination must total exactly ${targetBuild.value}.`);
      }
      for (const id of handCardIds) ownHand.splice(ownHand.findIndex((card) => card.id === id), 1);
      for (const id of floorCardIds) floor.splice(floor.findIndex((card) => card.id === id), 1);
      for (const id of opponentPileCardIds) {
        const pile = Object.values(capturedPiles).find((cards) => cards[cards.length - 1]?.id === id);
        if (!pile) throw new Error("An opponent pile changed while capturing the build.");
        pile.pop();
      }
      const [capturedBuild] = builds.splice(buildIndex, 1);
      capturedPiles[String(player.seat)].push(...capturedBuild.cards, ...selectedHand, ...selectedFloor, ...selectedOpponentPile);
      state.lastCapturerSeat = player.seat;
      if (state.shiyaPending) {
        const pending = state.shiyaPending as { seat: number; team: number; buildIds: string[] };
        if (pending.seat !== player.seat || !pending.buildIds.includes(buildId)) throw new Error("After Shiya, capture one of the two builds involved in that Shiya turn.");
        delete state.shiyaPending;
        state.currentSeat = (player.seat % players.length) + 1;
        state.message = `Seat ${player.seat} captured a Shiya build. The turn ends immediately.`;
      } else {
        state.message = `Seat ${player.seat} captured build value ${targetBuild.value}.`;
      }
    } else if (action === "capture-loose") {
      const handCardId = typeof body.cardId === "string" ? body.cardId : "";
      const floorCardId = typeof body.targetCardId === "string" ? body.targetCardId : "";
      const handIndex = ownHand.findIndex((card) => card.id === handCardId);
      const floor = state.floor as Card[];
      const floorIndex = floor.findIndex((card) => card.id === floorCardId);
      if (handIndex < 0 || floorIndex < 0) throw new Error("Choose a card from your hand and a loose floor card.");
      if (ownHand[handIndex].rank !== floor[floorIndex].rank) throw new Error("Direct capture requires equal card values.");
      const [handCard] = ownHand.splice(handIndex, 1);
      const [floorCard] = floor.splice(floorIndex, 1);
      const capturedPiles = state.capturedPiles as Record<string, Card[]>;
      capturedPiles[String(player.seat)].push(handCard, floorCard);
      state.lastCapturerSeat = player.seat;
      state.message = `Seat ${player.seat} captured a loose ${floorCard.rank}.`;
    } else if (action === "top-up-build") {
      const buildId = typeof body.buildId === "string" ? body.buildId : "";
      const handCardIds: string[] = Array.isArray(body.handCardIds)
        ? body.handCardIds.filter((id: unknown): id is string => typeof id === "string")
        : [];
      if (!buildId || handCardIds.length === 0 || new Set(handCardIds).size !== handCardIds.length) {
        throw new Error("Select a partner build and one or more different cards from your hand.");
      }
      if (players.length !== 4) throw new Error("Partner build top-ups are only available in Four Hands.");
      const builds = state.builds as Array<{ id: string; value: number; ownerSeat: number; team: number; cards: Card[] }>;
      const build = builds.find((item) => item.id === buildId);
      if (!build) throw new Error("That active build is no longer available.");
      const playerTeam = player.seat % 2 === 1 ? 1 : 2;
      if (build.team !== playerTeam || build.ownerSeat === player.seat) {
        throw new Error("You may only top up your partner's build.");
      }
      const selectedCards = handCardIds.map((id) => {
        const index = ownHand.findIndex((card) => card.id === id);
        if (index < 0) throw new Error("Every top-up card must be in your own hand.");
        return ownHand[index];
      });
      const addedValue = selectedCards.reduce((total, card) => total + card.rank, 0);
      if (addedValue !== build.value) {
        throw new Error(`The selected cards must add up exactly to ${build.value}.`);
      }
      for (const id of handCardIds) {
        ownHand.splice(ownHand.findIndex((card) => card.id === id), 1);
      }
      build.cards.push(...selectedCards);
      state.message = `Seat ${player.seat} topped up their partner's build.`;
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

    const transferAction = ["request-build-transfer", "approve-build-transfer", "reject-build-transfer"].includes(action);
    const { data: newVersion, error: commitError } = transferAction
      ? await admin.rpc("casino_commit_partner_transfer", {
          p_game_id: game.id,
          p_actor_user_id: userId,
          p_expected_version: privateRow.version,
          p_next_state: state
        })
      : await admin.rpc("casino_commit_game_action", {
          p_game_id: game.id,
          p_actor_user_id: userId,
          p_expected_version: privateRow.version,
          p_next_state: state,
          p_next_round: state.round,
          p_next_seat: state.currentSeat,
          p_next_status: nextStatus
        });
    if (commitError) throw commitError;

    const currentPlayer = players.find((item) => item.user_id === userId)!;
    const latestHands = state.hands as Record<string, Card[]>;
    const latestDeck = state.deck as Card[];
    const latestFloor = state.floor as Card[];
    const response = {
      gameId: game.id,
      version: newVersion,
      gameMode: game.game_mode,
      round: state.round,
      currentSeat: state.currentSeat,
      phase: state.phase,
      ownSeat: currentPlayer.seat,
      ownHand: latestHands[String(currentPlayer.seat)] ?? [],
      ownHandCount: (latestHands[String(currentPlayer.seat)] ?? []).length,
      opponents: Object.entries(latestHands)
        .filter(([seat]) => Number(seat) !== currentPlayer.seat)
        .map(([seat, hand]) => ({ seat: Number(seat), handCount: hand.length })),
      floor: latestFloor,
      builds: (state.builds as Array<{ id: string; value: number; ownerSeat: number; team: number; cards: Card[] }>).map((build) => ({ id: build.id, value: build.value, ownerSeat: build.ownerSeat, team: build.team, cards: build.cards })),
      ownershipRequests: state.ownershipRequests ?? [],
      capturedPiles: Object.entries(state.capturedPiles as Record<string, Card[]>).map(([seat, pile]) => ({ seat: Number(seat), count: pile.length, topCard: pile.length ? pile[pile.length - 1] : null })),
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
