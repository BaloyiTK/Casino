/// <reference lib="deno.ns" />
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createShuffledDeck, dealInitialHands, secureShuffle, validateDeckAndDeal, type Card } from "./shuffle-deal.ts";
const suits = ["♠", "♥", "♦", "♣"] as const;
const canonical: Card[] = suits.flatMap((suit) => Array.from({ length: 10 }, (_, index) => ({ id: `${suit}-${index + 1}`, suit, rank: index + 1 })));
Deno.test("Fisher–Yates returns a permutation and does not mutate its input", () => {
  const input = [0, 1, 2, 3, 4, 5];
  const shuffled = secureShuffle(input, () => 0);
  assertEquals([...shuffled].sort(), input);
  assertEquals(input, [0, 1, 2, 3, 4, 5]);
});
Deno.test("Fisher–Yates rejection-samples out-of-range random draws", () => {
  const draws = [0xffffffff, 0, 0, 0, 0]; let index = 0;
  const shuffled = secureShuffle([1, 2, 3], () => draws[index++] ?? 0);
  assertEquals([...shuffled].sort(), [1, 2, 3]);
  if (index < 3) throw new Error("Expected invalid random draw to be rejected.");
});
Deno.test("suit-first then full-deck shuffle preserves all 40 canonical cards", () => {
  const deck = createShuffledDeck(() => 0);
  assertEquals(deck.length, 40);
  assertEquals(new Set(deck.map((card) => card.id)).size, 40);
  assertEquals(deck.map((card) => card.id).sort(), canonical.map((card) => card.id).sort());
  for (const card of deck) { const expected = canonical.find((item) => item.id === card.id)!; assertEquals(card.suit, expected.suit); assertEquals(card.rank, expected.rank); }
});
Deno.test("Two Hands deals two cards per player per cycle and retains the next 20 cards", () => {
  const dealt = dealInitialHands([{ seat: 1 }, { seat: 2 }], canonical);
  const indexes1 = [0,1,4,5,8,9,12,13,16,17], indexes2 = [2,3,6,7,10,11,14,15,18,19];
  assertEquals(dealt.hands["1"].map((card) => card.id), indexes1.map((i) => canonical[i].id));
  assertEquals(dealt.hands["2"].map((card) => card.id), indexes2.map((i) => canonical[i].id));
  assertEquals(dealt.deck.map((card) => card.id), canonical.slice(20).map((card) => card.id));
  validateDeckAndDeal(dealt.deck, dealt.hands, 2, []);
});
Deno.test("Four Hands deals two consecutive cards to each player per cycle", () => {
  const dealt = dealInitialHands([1,2,3,4].map((seat) => ({ seat })), canonical);
  for (let seat = 1; seat <= 4; seat++) {
    const indexes = Array.from({ length: 5 }, (_, cycle) => [cycle * 8 + (seat - 1) * 2, cycle * 8 + (seat - 1) * 2 + 1]).flat();
    assertEquals(dealt.hands[String(seat)].map((card) => card.id), indexes.map((i) => canonical[i].id));
  }
  assertEquals(dealt.deck.length, 0);
  validateDeckAndDeal(dealt.deck, dealt.hands, 4, []);
});
Deno.test("validation rejects card data inconsistent with canonical ID", () => {
  const dealt = dealInitialHands([{ seat: 1 }, { seat: 2 }], canonical);
  dealt.hands["1"][0] = { ...dealt.hands["1"][0], rank: 10 };
  assertThrows(() => validateDeckAndDeal(dealt.deck, dealt.hands, 2, []), Error, "canonical ID");
});
Deno.test("validation rejects a non-empty starting floor", () => {
  const dealt = dealInitialHands([{ seat: 1 }, { seat: 2 }], canonical);
  assertThrows(() => validateDeckAndDeal(dealt.deck, dealt.hands, 2, [canonical[0]]), Error, "floor must be empty");
});
Deno.test("validation rejects incomplete seats and missing cards", () => {
  const dealt = dealInitialHands([{ seat: 1 }, { seat: 2 }], canonical);
  assertThrows(() => validateDeckAndDeal(dealt.deck, { "1": dealt.hands["1"] }, 2, []), Error, "seats are incomplete");
  assertThrows(() => validateDeckAndDeal(dealt.deck.slice(1), dealt.hands, 2, []), Error, "40-card deck");
});
