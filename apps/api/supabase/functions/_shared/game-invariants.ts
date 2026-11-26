export type Suit = "♠" | "♥" | "♦" | "♣";
export type Card = { id: string; suit: Suit; rank: number };
export type PlayerRow = { user_id: string; display_name: string; seat: number };

type GameState = Record<string, any>;

export type RecoverableBuild = {
  id: string;
  value: number;
  originalOwnerSeat: number;
  originalTeam: number;
  capturedBySeat: number;
  status: "captured" | "recovered";
  partnerRecoveryBlocked: boolean;
  recoveredBySeat?: number;
};

export function blockPartnerRecoveryForDraft(
  recoverableBuilds: RecoverableBuild[],
  ownerSeat: number,
  draftedValue: number
): void {
  for (const build of recoverableBuilds) {
    if (build.status === "captured" &&
      build.originalOwnerSeat === ownerSeat &&
      build.value === draftedValue) {
      build.partnerRecoveryBlocked = true;
    }
  }
}

export function canRecoverCapturedBuild(
  build: RecoverableBuild,
  playerSeat: number,
  playerTeam: number
): boolean {
  if (build.status !== "captured" || build.originalTeam !== playerTeam) return false;
  return build.originalOwnerSeat === playerSeat || !build.partnerRecoveryBlocked;
}

export function validateCardLedger(state: GameState): void {
  const suits: Suit[] = ["♠", "♥", "♦", "♣"];
  const expected = new Map<string, { suit: Suit; rank: number }>(suits.flatMap((suit) =>
    Array.from({ length: 10 }, (_, index) => {
      const rank = index + 1;
      return [`${suit}-${rank}`, { suit, rank }] as const;
    })
  ));
  const deck = state.deck as Card[];
  const hands = Object.values(state.hands as Record<string, Card[]>).flat();
  const floor = state.floor as Card[];
  const builds = (state.builds as Array<{ cards: Card[] }>).flatMap((build) => build.cards);
  const captured = Object.values(state.capturedPiles as Record<string, Card[]>).flat();
  const allCards = [...deck, ...hands, ...floor, ...builds, ...captured];

  if (allCards.length !== 40) {
    throw new Error("Card integrity check failed: all 40 physical cards must exist exactly once.");
  }

  const seen = new Set<string>();
  for (const card of allCards) {
    const canonical = expected.get(card.id);
    if (!canonical || seen.has(card.id) || card.suit !== canonical.suit || card.rank !== canonical.rank) {
      throw new Error("Card integrity check failed: invalid, duplicated, or altered physical card.");
    }
    seen.add(card.id);
  }
  if (seen.size !== expected.size) {
    throw new Error("Card integrity check failed: a physical card is missing.");
  }
}

export function validateBuildIntegrity(state: GameState, players: PlayerRow[]): void {
  const builds = state.builds as Array<{
    id: string;
    value: number;
    ownerSeat: number;
    team: number;
    cards: Card[];
  }>;
  const validSeats = new Set(players.map((player) => player.seat));
  const values = new Set<number>();
  const buildsByOwner = new Map<number, string[]>();

  for (const build of builds) {
    if (!build.id || !validSeats.has(build.ownerSeat)) {
      throw new Error("Build integrity check failed: every active build must have a valid owner.");
    }
    const expectedTeam = players.length === 2
      ? build.ownerSeat
      : (build.ownerSeat % 2 === 1 ? 1 : 2);
    if (build.team !== expectedTeam) {
      throw new Error("Build integrity check failed: build team does not match its individual owner.");
    }
    const cardTotal = Array.isArray(build.cards)
      ? build.cards.reduce((total, card) => total + card.rank, 0)
      : 0;
    if (!Number.isInteger(build.value) || build.value < 1 || build.value > 10 ||
      !Array.isArray(build.cards) || build.cards.length === 0 ||
      build.cards.some((card) => !Number.isInteger(card.rank) || card.rank < 1 || card.rank > 10) ||
      cardTotal < build.value || cardTotal % build.value !== 0) {
      throw new Error("Build integrity check failed: build cards must contain the original value plus zero or more complete value-sized top-ups.");
    }
    if (values.has(build.value)) {
      throw new Error("Build integrity check failed: two active builds cannot have the same value.");
    }
    values.add(build.value);
    const owned = buildsByOwner.get(build.ownerSeat) ?? [];
    owned.push(build.id);
    buildsByOwner.set(build.ownerSeat, owned);
  }

  for (const [ownerSeat, ownedBuildIds] of buildsByOwner) {
    if (ownedBuildIds.length <= 1) continue;
    const pending = state.shiyaPending as { seat: number; buildIds: string[] } | undefined;
    const allowedIds = pending?.seat === ownerSeat ? pending.buildIds : [];
    if (players.length !== 4 || ownedBuildIds.length !== 2 ||
      ownedBuildIds.some((id) => !allowedIds.includes(id)) ||
      allowedIds.length !== 2 || allowedIds.some((id) => !ownedBuildIds.includes(id))) {
      throw new Error("Build integrity check failed: a player may own two builds only during a valid Shiya capture requirement.");
    }
  }

  if (state.shiyaPending) {
    const pending = state.shiyaPending as { seat: number; buildIds: string[] };
    const ownedBuildIds = buildsByOwner.get(pending.seat) ?? [];
    if (players.length !== 4 || ownedBuildIds.length !== 2 ||
      pending.buildIds.length !== 2 ||
      pending.buildIds.some((id) => !ownedBuildIds.includes(id))) {
      throw new Error("Build integrity check failed: the pending Shiya state must identify exactly two builds owned by that player.");
    }
  }
}


export function awardRemainingFloorCards(state: GameState): number {
  const lastCapturerSeat = state.lastCapturerSeat;
  if (!Number.isInteger(lastCapturerSeat)) return 0;
  const floor = state.floor as Card[];
  const capturedPiles = state.capturedPiles as Record<string, Card[]>;
  const winnerPile = capturedPiles[String(lastCapturerSeat)];
  if (!Array.isArray(winnerPile)) {
    throw new Error("End-of-game award failed: the last successful capturer has no captured pile.");
  }
  const awarded = floor.splice(0, floor.length);
  winnerPile.push(...awarded);
  return awarded.length;
}
