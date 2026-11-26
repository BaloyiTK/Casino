import { getRandomBytes } from "expo-crypto";

export const SUITS = ["♠", "♥", "♦", "♣"] as const;
export type Suit = (typeof SUITS)[number];
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type GameMode = "two" | "four";

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
}

export interface Player {
  id: number;
  name: string;
  team: number;
  hand: Card[];
}

export interface GameState {
  mode: GameMode;
  players: Player[];
  deck: Card[];
  floor: Card[];
  currentPlayer: number;
  round: number;
  roundStarter: number;
  phase: "playing" | "round-complete" | "game-complete";
  message: string;
}

export function createDeck(): Card[] {
  return SUITS.flatMap((suit) =>
    Array.from({ length: 10 }, (_, index) => ({
      id: `${suit}-${index + 1}`,
      suit,
      rank: (index + 1) as Rank
    }))
  );
}

function secureRandomUint32(): number {
  const bytes = getRandomBytes(4);
  return (
    bytes[0] |
    (bytes[1] << 8) |
    (bytes[2] << 16) |
    (bytes[3] << 24)
  ) >>> 0;
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

export function shuffleDeck(): Card[] {
  const shuffledSuits = SUITS.flatMap((suit) =>
    secureShuffle(createDeck().filter((card) => card.suit === suit))
  );
  return secureShuffle(shuffledSuits);
}

function validateDeal(players: Player[], deck: Card[], floor: Card[], expectedDeckCount: number, expectedTotalCards: number, requireEmptyFloor = true): void {
  const expected = new Map(createDeck().map((card) => [card.id, card]));
  const dealt = players.flatMap((player) => player.hand);
  const allCards = [...deck, ...dealt];
  const ids = allCards.map((card) => card.id);
  if (allCards.length !== expectedTotalCards || new Set(ids).size !== expectedTotalCards) {
    throw new Error("Shuffle/deal validation failed: card count or uniqueness is invalid.");
  }
  for (const card of allCards) {
    const canonical = expected.get(card.id);
    if (!canonical || canonical.suit !== card.suit || canonical.rank !== card.rank) {
      throw new Error("Shuffle/deal validation failed: card suit or rank does not match its canonical ID.");
    }
  }
  if (players.length !== 2 && players.length !== 4) throw new Error("Invalid player count for dealing.");
  if (players.some((player) => player.hand.length !== 10)) {
    throw new Error("Shuffle/deal validation failed: every player must have exactly 10 cards.");
  }
  if (deck.length !== expectedDeckCount) throw new Error("Shuffle/deal validation failed: unexpected remaining deck size.");
  if (requireEmptyFloor && floor.length !== 0) throw new Error("Shuffle/deal validation failed: the starting floor must be empty.");
}

function dealTen(players: Player[], deck: Card[]): { players: Player[]; deck: Card[] } {
  const nextPlayers = players.map((player) => ({ ...player, hand: [...player.hand] }));
  const nextDeck = [...deck];
  for (let cycle = 0; cycle < 5; cycle++) {
    for (const player of nextPlayers) {
      for (let count = 0; count < 2; count++) {
        const card = nextDeck.shift();
        if (!card) throw new Error("The deck ran out during dealing.");
        player.hand.push(card);
      }
    }
  }
  return { players: nextPlayers, deck: nextDeck };
}

export function startGame(mode: GameMode): GameState {
  const count = mode === "two" ? 2 : 4;
  const emptyPlayers: Player[] = Array.from({ length: count }, (_, id) => ({
    id,
    name: `Player ${id + 1}`,
    team: mode === "two" ? id : id % 2,
    hand: []
  }));
  let dealt: { players: Player[]; deck: Card[] } | undefined;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      dealt = dealTen(emptyPlayers, shuffleDeck());
      validateDeal(dealt.players, dealt.deck, [], mode === "two" ? 20 : 0, 40);
      break;
    } catch (error) {
      lastError = error;
      dealt = undefined;
    }
  }
  if (!dealt) {
    throw new Error(`Could not create a valid deal after 3 complete shuffle/deal attempts: ${lastError instanceof Error ? lastError.message : "unknown validation error"}`);
  }
  return {
    mode,
    players: dealt.players,
    deck: dealt.deck,
    floor: [],
    currentPlayer: 0,
    round: 1,
    roundStarter: 0,
    phase: "playing",
    message: "The floor is clear. Player 1 starts."
  };
}

export function playToFloor(state: GameState, cardId: string): GameState {
  if (state.phase !== "playing") return state;
  const active = state.players[state.currentPlayer];
  const card = active.hand.find((item) => item.id === cardId);
  if (!card) return state;
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === active.id
        ? { ...player, hand: player.hand.filter((item) => item.id !== cardId) }
        : player
    ),
    floor: [...state.floor, card],
    message: `${active.name} drafted ${cardLabel(card)} onto the floor.`
  };
}

export function endTurn(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  const nextPlayer = (state.currentPlayer + 1) % state.players.length;
  const allHandsEmpty = state.players.every((player) => player.hand.length === 0);

  if (allHandsEmpty && state.mode === "two" && state.round === 1) {
    const dealt = dealTen(state.players, state.deck);
    validateDeal(dealt.players, dealt.deck, state.floor, 0, 20, false);
    return {
      ...state,
      players: dealt.players,
      deck: dealt.deck,
      currentPlayer: state.roundStarter,
      round: 2,
      message: "Round 1 complete. The second deal is ready; Player 1 starts Round 2."
    };
  }

  if (allHandsEmpty) {
    return {
      ...state,
      phase: "round-complete",
      message: "All hands are empty. Scoring is not enabled until the remaining scoring rules are confirmed."
    };
  }

  return {
    ...state,
    currentPlayer: nextPlayer,
    message: `${state.players[nextPlayer].name}'s turn.`
  };
}

export function cardLabel(card: Card): string {
  return `${card.rank === 1 ? "A" : card.rank}${card.suit}`;
}

export function isRed(card: Card): boolean {
  return card.suit === "♥" || card.suit === "♦";
}
