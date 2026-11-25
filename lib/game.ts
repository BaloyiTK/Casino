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

function secureShuffle<T>(items: T[]): T[] {
  const result = [...items];
  const randomValues = new Uint32Array(result.length);
  crypto.getRandomValues(randomValues);

  for (let i = result.length - 1; i > 0; i--) {
    const limit = Math.floor(0x100000000 / (i + 1)) * (i + 1);
    let value = randomValues[i];
    // Refill if the value falls in the modulo-bias rejection range.
    while (value >= limit) {
      const extra = new Uint32Array(1);
      crypto.getRandomValues(extra);
      value = extra[0];
    }
    const j = value % (i + 1);
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

export function startGame(mode: GameMode): GameState {
  const playerCount = mode === "two" ? 2 : 4;
  const players: Player[] = Array.from({ length: playerCount }, (_, index) => ({
    id: index,
    name: `Player ${index + 1}`,
    team: mode === "two" ? index : index % 2,
    hand: []
  }));

  const deck = shuffleDeck();
  for (let card = 0; card < 10; card++) {
    for (const player of players) {
      const next = deck.shift();
      if (next) player.hand.push(next);
    }
  }

  return {
    mode,
    players,
    deck,
    floor: [],
    currentPlayer: 0,
    round: 1,
    roundStarter: 0,
    phase: "playing",
    message: "The table is clear. Player 1 starts."
  };
}

export function playToFloor(state: GameState, cardId: string): GameState {
  if (state.phase !== "playing") return state;
  const player = state.players[state.currentPlayer];
  const cardIndex = player.hand.findIndex((card) => card.id === cardId);
  if (cardIndex < 0) return state;

  const card = player.hand[cardIndex];
  const players = state.players.map((entry) =>
    entry.id === player.id
      ? { ...entry, hand: entry.hand.filter((item) => item.id !== cardId) }
      : entry
  );

  return {
    ...state,
    players,
    floor: [...state.floor, card],
    message: `${player.name} played ${cardLabel(card)} onto the table.`
  };
}

export function endTurn(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  const nextPlayer = (state.currentPlayer + 1) % state.players.length;
  const players = state.players.map((player) => ({ ...player, hand: [...player.hand] }));
  const allHandsEmpty = players.every((player) => player.hand.length === 0);

  if (allHandsEmpty && state.mode === "two" && state.round === 1 && state.deck.length === 20) {
    for (let card = 0; card < 10; card++) {
      for (const player of players) {
        const next = state.deck.shift();
        if (next) player.hand.push(next);
      }
    }
    return {
      ...state,
      players,
      currentPlayer: state.roundStarter,
      round: 2,
      message: "Round 1 is complete. The second 10 cards have been dealt. The same player starts Round 2."
    };
  }

  if (allHandsEmpty) {
    return {
      ...state,
      players,
      phase: "round-complete",
      message: "All hands are empty. Round-end rules and scoring are still being finalised."
    };
  }

  return {
    ...state,
    players,
    currentPlayer: nextPlayer,
    message: `${players[nextPlayer].name}'s turn.`
  };
}

export function cardLabel(card: Card): string {
  const rank = card.rank === 1 ? "A" : String(card.rank);
  return `${rank}${card.suit}`;
}

export function isRed(card: Card): boolean {
  return card.suit === "♥" || card.suit === "♦";
}
