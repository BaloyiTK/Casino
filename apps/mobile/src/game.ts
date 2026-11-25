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
  const dealt = dealTen(emptyPlayers, shuffleDeck());
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
