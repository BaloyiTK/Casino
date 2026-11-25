import type { Card, Suit } from "./game";

export type PlayerId = number;
export type TeamId = number;

export interface ActiveBuild {
  id: string;
  value: number;
  ownerId: PlayerId;
  teamId: TeamId;
  cards: Card[];
}

export interface CapturedPile {
  playerId: PlayerId;
  cards: Card[]; // Bottom to top; only the final card is exposed.
}

export interface RulesState {
  players: Array<{
    id: PlayerId;
    teamId: TeamId;
    hand: Card[];
  }>;
  floor: Card[];
  builds: ActiveBuild[];
  capturedPiles: CapturedPile[];
  lastSuccessfulCapturerId: PlayerId | null;
  gameOver: boolean;
  winnerTeamId: TeamId | null;
  nextBuildNumber: number;
  shiyaObligation: {
    playerId: PlayerId;
    buildIds: string[];
  } | null;
}

export type RuleResult =
  | { ok: true; state: RulesState; message: string }
  | { ok: false; state: RulesState; error: string };

const fail = (state: RulesState, error: string): RuleResult => ({
  ok: false,
  state,
  error
});

const succeed = (state: RulesState, message: string): RuleResult => ({
  ok: true,
  state,
  message
});

const sum = (cards: Card[]) => cards.reduce((total, card) => total + card.rank, 0);

function getPlayer(state: RulesState, playerId: PlayerId) {
  return state.players.find((player) => player.id === playerId);
}

function getPile(state: RulesState, playerId: PlayerId) {
  return state.capturedPiles.find((pile) => pile.playerId === playerId);
}

function sameCards(cards: Card[]) {
  return new Set(cards.map((card) => card.id)).size === cards.length;
}

function removeCards(cards: Card[], ids: string[]) {
  const wanted = new Set(ids);
  return cards.filter((card) => !wanted.has(card.id));
}

function findSelected(source: Card[], ids: string[], label: string): Card[] | string {
  if (!sameIds(ids)) return `${label}: a card was selected more than once.`;
  const selected = ids.map((id) => source.find((card) => card.id === id));
  if (selected.some((card) => !card)) return `${label}: one or more selected cards are unavailable.`;
  return selected as Card[];
}

function sameIds(ids: string[]) {
  return new Set(ids).size === ids.length;
}

function collectOpponentPileTops(
  state: RulesState,
  playerId: PlayerId,
  ids: string[]
): { cards: Card[]; piles: CapturedPile[] } | string {
  if (!sameIds(ids)) return "A captured-pile card cannot be selected more than once.";
  const player = getPlayer(state, playerId);
  if (!player) return "Unknown player.";
  const cards: Card[] = [];
  const changedPiles = state.capturedPiles.map((pile) => ({ ...pile, cards: [...pile.cards] }));

  for (const id of ids) {
    const matches = changedPiles.filter((pile) => {
      const owner = getPlayer(state, pile.playerId);
      return owner && owner.teamId !== player.teamId && pile.cards[pile.cards.length - 1]?.id === id;
    });
    if (matches.length !== 1) {
      return "Only the visible top card of an opponent's captured pile is eligible.";
    }
    const pile = matches[0];
    cards.push(pile.cards.pop()!);
  }

  return { cards, piles: changedPiles };
}

function moveContributions(
  state: RulesState,
  playerId: PlayerId,
  handIds: string[],
  floorIds: string[],
  opponentPileTopIds: string[]
) {
  const player = getPlayer(state, playerId);
  if (!player) return "Unknown player.";
  if (handIds.length < 1) return "The player must contribute at least one card from their own hand.";
  const hand = findSelected(player.hand, handIds, "Hand");
  if (typeof hand === "string") return hand;
  const floor = findSelected(state.floor, floorIds, "Floor");
  if (typeof floor === "string") return floor;
  const pileResult = collectOpponentPileTops(state, playerId, opponentPileTopIds);
  if (typeof pileResult === "string") return pileResult;

  const all = [...hand, ...floor, ...pileResult.cards];
  if (!sameCards(all)) return "The same physical card cannot contribute more than once.";

  const nextPlayers = state.players.map((item) =>
    item.id === playerId ? { ...item, hand: removeCards(item.hand, handIds) } : item
  );
  return {
    cards: all,
    state: {
      ...state,
      players: nextPlayers,
      floor: removeCards(state.floor, floorIds),
      capturedPiles: pileResult.piles
    }
  };
}

export function createRulesState(
  players: RulesState["players"],
  floor: Card[] = [],
  capturedPiles?: CapturedPile[]
): RulesState {
  return {
    players: players.map((player) => ({ ...player, hand: [...player.hand] })),
    floor: [...floor],
    builds: [],
    capturedPiles: capturedPiles
      ? capturedPiles.map((pile) => ({ ...pile, cards: [...pile.cards] }))
      : players.map((player) => ({ playerId: player.id, cards: [] })),
    lastSuccessfulCapturerId: null,
    gameOver: false,
    winnerTeamId: null,
    nextBuildNumber: 1,
    shiyaObligation: null
  };
}

/** Checks the complete physical-card ledger. Supply all 40 cards as the canonical deck. */
export function validateCardLedger(state: RulesState, canonicalDeck: Card[]): string[] {
  const errors: string[] = [];
  const expected = new Set(canonicalDeck.map((card) => card.id));
  const locations: Card[] = [
    ...state.players.flatMap((player) => player.hand),
    ...state.floor,
    ...state.builds.flatMap((build) => build.cards),
    ...state.capturedPiles.flatMap((pile) => pile.cards)
  ];
  const counts = new Map<string, number>();
  for (const card of locations) counts.set(card.id, (counts.get(card.id) ?? 0) + 1);

  if (canonicalDeck.length !== 40 || expected.size !== 40) {
    errors.push("Canonical deck must contain exactly 40 unique cards.");
  }
  for (const id of expected) {
    if (counts.get(id) !== 1) errors.push(`Card ${id} must exist in exactly one location.`);
  }
  for (const [id, count] of counts) {
    if (!expected.has(id)) errors.push(`Unknown card ${id} is present in the game.`);
    if (count !== 1) errors.push(`Card ${id} appears in ${count} locations.`);
  }

  for (const build of state.builds) {
    if (sum(build.cards) !== build.value) {
      errors.push(`Build ${build.id} does not total its declared value.`);
    }
    if (build.value < 1 || build.value > 10) errors.push(`Build ${build.id} has an invalid value.`);
  }
  return errors;
}

export function draftCard(state: RulesState, playerId: PlayerId, cardId: string): RuleResult {
  if (state.gameOver) return fail(state, "The game is over.");
  if (state.shiyaObligation) return fail(state, "After Shiya, the player must capture one of the two builds immediately.");
  const player = getPlayer(state, playerId);
  if (!player) return fail(state, "Unknown player.");
  const card = player.hand.find((item) => item.id === cardId);
  if (!card) return fail(state, "The drafted card must be in the player's hand.");

  const next: RulesState = {
    ...state,
    players: state.players.map((item) =>
      item.id === playerId ? { ...item, hand: item.hand.filter((c) => c.id !== cardId) } : item
    ),
    floor: [...state.floor, card]
  };
  return succeed(next, `${card.id} drafted onto the floor.`);
}

export function createBuild(
  state: RulesState,
  playerId: PlayerId,
  handIds: string[],
  floorIds: string[],
  opponentPileTopIds: string[] = []
): RuleResult {
  if (state.gameOver) return fail(state, "The game is over.");
  if (state.shiyaObligation) return fail(state, "The Shiya obligation must be resolved by capturing one of its builds.");
  const player = getPlayer(state, playerId);
  if (!player) return fail(state, "Unknown player.");
  if (state.builds.some((build) => build.ownerId === playerId)) {
    return fail(state, "A player may normally own no more than one active build.");
  }
  if (state.builds.length === 0 && opponentPileTopIds.length > 0) {
    return fail(state, "Opponent captured-pile top cards may only be used when an active build already exists.");
  }

  const moved = moveContributions(state, playerId, handIds, floorIds, opponentPileTopIds);
  if (typeof moved === "string") return fail(state, moved);
  const value = sum(moved.cards);
  if (value < 1 || value > 10) return fail(state, "A build value must be between 1 and 10.");
  if (state.builds.some((build) => build.value === value)) {
    return fail(state, "Another active build already has this value.");
  }
  if (state.floor.some((card) => card.rank === value && !floorIds.includes(card.id))) {
    return fail(state, "A card of this value is already represented on the floor.");
  }

  const build: ActiveBuild = {
    id: `build-${state.nextBuildNumber}`,
    value,
    ownerId: playerId,
    teamId: player.teamId,
    cards: moved.cards
  };
  return succeed({
    ...moved.state,
    builds: [...state.builds, build],
    nextBuildNumber: state.nextBuildNumber + 1
  }, `Build ${build.id} created with value ${value}.`);
}

/** Partner top-ups are intentionally not implemented here: the locked rules do not fully specify their card sources. */
export function captureBuild(
  state: RulesState,
  playerId: PlayerId,
  buildId: string,
  handIds: string[],
  floorIds: string[],
  opponentPileTopIds: string[] = []
): RuleResult {
  if (state.gameOver) return fail(state, "The game is over.");
  const build = state.builds.find((item) => item.id === buildId);
  if (!build) return fail(state, "The selected build does not exist.");
  if (state.shiyaObligation &&
      (state.shiyaObligation.playerId !== playerId || !state.shiyaObligation.buildIds.includes(buildId))) {
    return fail(state, "The Shiya obligation only permits capturing one of the two transferred/owned builds.");
  }
  const player = getPlayer(state, playerId);
  if (!player) return fail(state, "Unknown player.");
  if (build.ownerId === playerId) {
    // A player may capture their own build.
  } else if (build.teamId === player.teamId) {
    return fail(state, "A player cannot directly capture a partner's build while the partner owns it.");
  }

  const moved = moveContributions(state, playerId, handIds, floorIds, opponentPileTopIds);
  if (typeof moved === "string") return fail(state, moved);
  if (sum(moved.cards) !== build.value) {
    return fail(state, `Capture contributions must total exactly ${build.value}.`);
  }

  const remainingBuilds = state.builds.filter((item) => item.id !== buildId);
  const capturedCards = [...build.cards, ...moved.cards];
  const existingPile = moved.state.capturedPiles.find((pile) => pile.playerId === playerId);
  const capturedPiles = existingPile
    ? moved.state.capturedPiles.map((pile) =>
        pile.playerId === playerId ? { ...pile, cards: [...pile.cards, ...capturedCards] } : pile
      )
    : [...moved.state.capturedPiles, { playerId, cards: capturedCards }];

  const obligationResolved = state.shiyaObligation?.playerId === playerId &&
    state.shiyaObligation.buildIds.includes(buildId);
  const next: RulesState = {
    ...moved.state,
    builds: remainingBuilds,
    capturedPiles,
    lastSuccessfulCapturerId: playerId,
    shiyaObligation: obligationResolved ? null : state.shiyaObligation
  };
  return succeed(next, `Player ${playerId} captured build ${buildId}.`);
}

/** Shiya transfers a partner's build immediately and requires a same-turn capture. */
export function shiya(state: RulesState, playerId: PlayerId, buildId: string): RuleResult {
  if (state.gameOver) return fail(state, "The game is over.");
  if (state.shiyaObligation) return fail(state, "An existing Shiya obligation must be resolved first.");
  const player = getPlayer(state, playerId);
  const build = state.builds.find((item) => item.id === buildId);
  if (!player || !build) return fail(state, "Unknown player or build.");
  const owner = getPlayer(state, build.ownerId);
  if (!owner || owner.id === playerId || owner.teamId !== player.teamId) {
    return fail(state, "Shiya is only permitted on a partner's build.");
  }
  const alreadyOwnsBuild = state.builds.some((item) => item.ownerId === playerId);
  const nextBuilds = state.builds.map((item) =>
    item.id === buildId ? { ...item, ownerId: playerId } : item
  );

  if (alreadyOwnsBuild) {
    const ids = state.builds.filter((item) => item.ownerId === playerId).map((item) => item.id);
    return succeed({
      ...state,
      builds: nextBuilds,
      shiyaObligation: { playerId, buildIds: ids }
    }, "Shiya transferred. The player must now capture at least one of their two builds.");
  }
  return succeed({ ...state, builds: nextBuilds }, "Shiya transferred build ownership immediately.");
}

/** A normal partner pass is only legal when the current owner explicitly approves it. */
export function transferBuildByConsent(
  state: RulesState,
  requestingPartnerId: PlayerId,
  buildId: string,
  ownerApproved: boolean
): RuleResult {
  if (!ownerApproved) return fail(state, "The current owner did not approve the ownership transfer.");
  if (state.gameOver || state.shiyaObligation) return fail(state, "Ownership cannot be transferred in the current state.");
  const requester = getPlayer(state, requestingPartnerId);
  const build = state.builds.find((item) => item.id === buildId);
  const owner = build ? getPlayer(state, build.ownerId) : undefined;
  if (!requester || !build || !owner || requester.id === owner.id || requester.teamId !== owner.teamId) {
    return fail(state, "Only the current owner's partner may request this transfer.");
  }
  return succeed({
    ...state,
    builds: state.builds.map((item) =>
      item.id === buildId ? { ...item, ownerId: requestingPartnerId } : item
    )
  }, "The owner approved the transfer; build ownership has changed.");
}

/** Call when the player attempts a non-capture action after Shiya. */
export function forfeitAfterShiya(state: RulesState, playerId: PlayerId): RuleResult {
  if (!state.shiyaObligation || state.shiyaObligation.playerId !== playerId) {
    return fail(state, "There is no Shiya obligation for this player.");
  }
  const player = getPlayer(state, playerId);
  if (!player) return fail(state, "Unknown player.");
  return succeed({
    ...state,
    gameOver: true,
    winnerTeamId: player.teamId === 0 ? 1 : 0,
    shiyaObligation: null
  }, "The Shiya obligation was not fulfilled. The opposing team wins all 11 points.");
}

/** Final loose floor cards belong to the last successful capturer. */
export function awardRemainingFloor(state: RulesState): RuleResult {
  if (state.floor.length === 0) return succeed(state, "No loose floor cards remain.");
  if (state.lastSuccessfulCapturerId === null) {
    return fail(state, "Cannot award remaining floor cards: no successful capturer is recorded.");
  }
  const pile = getPile(state, state.lastSuccessfulCapturerId);
  if (!pile) return fail(state, "The last successful capturer has no captured pile.");
  return succeed({
    ...state,
    floor: [],
    capturedPiles: state.capturedPiles.map((item) =>
      item.playerId === state.lastSuccessfulCapturerId
        ? { ...item, cards: [...item.cards, ...state.floor] }
        : item
    )
  }, "Remaining loose floor cards awarded to the last successful capturer.");
}

export function cardRankValue(card: Card): number {
  return card.rank;
}

export function isValidSuit(suit: string): suit is Suit {
  return suit === "♠" || suit === "♥" || suit === "♦" || suit === "♣";
}
