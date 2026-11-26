export type Suit = "♠" | "♥" | "♦" | "♣";
export type Card = { id: string; suit: Suit; rank: number };
export type DealPlayer = { seat: number };
const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];

function secureRandomUint32(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0];
}

export function secureShuffle<T>(items: T[], randomUint32: () => number = secureRandomUint32): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const range = i + 1;
    const limit = Math.floor(0x100000000 / range) * range;
    let value = randomUint32();
    while (!Number.isInteger(value) || value < 0 || value >= 0x100000000 || value >= limit) {
      value = randomUint32();
    }
    const j = value % range;
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function createShuffledDeck(randomUint32: () => number = secureRandomUint32): Card[] {
  const shuffledSuits = SUITS.flatMap((suit) =>
    secureShuffle(Array.from({ length: 10 }, (_, index) => ({
      id: `${suit}-${index + 1}`,
      suit,
      rank: index + 1
    })), randomUint32)
  );
  return secureShuffle(shuffledSuits, randomUint32);
}

export function dealInitialHands(players: DealPlayer[], sourceDeck: Card[]) {
  const deck = [...sourceDeck];
  const hands: Record<string, Card[]> = Object.fromEntries(players.map((player) => [String(player.seat), []]));
  for (let cycle = 0; cycle < 5; cycle++) {
    for (const player of players) {
      for (let count = 0; count < 2; count++) {
        const card = deck.shift();
        if (!card) throw new Error("The deck ran out during dealing.");
        hands[String(player.seat)].push(card);
      }
    }
  }
  return { deck, hands };
}

export function validateDeckAndDeal(
  deck: Card[],
  hands: Record<string, Card[]>,
  playerCount: number,
  floor: Card[] = []
): void {
  if (playerCount !== 2 && playerCount !== 4) throw new Error("Only Two Hands or Four Hands can be dealt.");
  if (Object.keys(hands).length !== playerCount ||
      Array.from({ length: playerCount }, (_, index) => String(index + 1)).some((seat) => !(seat in hands))) {
    throw new Error("Shuffle/deal validation failed: player seats are incomplete.");
  }
  const expected = new Map<string, { suit: Suit; rank: number }>(SUITS.flatMap((suit) =>
    Array.from({ length: 10 }, (_, index) => [`${suit}-${index + 1}`, { suit, rank: index + 1 }] as const)
  ));
  const dealt = Object.values(hands).flat();
  const allCards = [...deck, ...dealt];
  const ids = allCards.map((card) => card.id);
  if (allCards.length !== 40 || new Set(ids).size !== 40 || ids.some((id) => !expected.has(id))) {
    throw new Error("Shuffle/deal validation failed: the 40-card deck is incomplete or contains duplicates.");
  }
  for (const card of allCards) {
    const canonical = expected.get(card.id);
    if (!canonical || canonical.suit !== card.suit || canonical.rank !== card.rank) {
      throw new Error("Shuffle/deal validation failed: card suit or rank does not match its canonical ID.");
    }
  }
  if (Object.values(hands).some((hand) => hand.length !== 10)) {
    throw new Error("Shuffle/deal validation failed: every player must have exactly 10 cards.");
  }
  if (playerCount === 2 && deck.length !== 20) {
    throw new Error("Two Hands validation failed: Round 2 must retain 20 cards.");
  }
  if (playerCount === 4 && deck.length !== 0) {
    throw new Error("Four Hands validation failed: all 40 cards must be dealt.");
  }
  if (floor.length !== 0) {
    throw new Error("Shuffle/deal validation failed: the floor must be empty at the start.");
  }
}

export function createValidatedInitialDeal(players: DealPlayer[], playerCount: number) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const deck = createShuffledDeck();
      const dealt = dealInitialHands(players, deck);
      validateDeckAndDeal(dealt.deck, dealt.hands, playerCount, []);
      return dealt;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Could not create a valid deal after 3 complete shuffle/deal attempts: ${lastError instanceof Error ? lastError.message : "unknown validation error"}`);
}
