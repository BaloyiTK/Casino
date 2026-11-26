/// <reference lib="deno.ns" />
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { awardRemainingFloorCards, blockPartnerRecoveryForDraft, canRecoverCapturedBuild, validateBuildIntegrity, validateCardLedger, type Card, type PlayerRow, type RecoverableBuild } from "./game-invariants.ts";

const suits = ["♠", "♥", "♦", "♣"] as const;
const allCards: Card[] = suits.flatMap((suit) =>
  Array.from({ length: 10 }, (_, index) => ({
    id: `${suit}-${index + 1}`,
    suit,
    rank: index + 1
  }))
);
const twoPlayers: PlayerRow[] = [
  { user_id: "p1", display_name: "P1", seat: 1 },
  { user_id: "p2", display_name: "P2", seat: 2 }
];
const fourPlayers: PlayerRow[] = [
  ...twoPlayers,
  { user_id: "p3", display_name: "P3", seat: 3 },
  { user_id: "p4", display_name: "P4", seat: 4 }
];

function ledgerState(): Record<string, any> {
  return {
    deck: [...allCards],
    hands: { "1": [], "2": [], "3": [], "4": [] },
    floor: [],
    builds: [],
    capturedPiles: { "1": [], "2": [], "3": [], "4": [] }
  };
}

Deno.test("card ledger accepts all 40 unique canonical cards", () => {
  validateCardLedger(ledgerState());
});

Deno.test("card ledger rejects a duplicated physical card", () => {
  const state = ledgerState();
  state.floor.push(state.deck[0]);
  assertThrows(() => validateCardLedger(state), Error, "40 physical cards");
});

Deno.test("card ledger rejects a missing physical card", () => {
  const state = ledgerState();
  state.deck.pop();
  assertThrows(() => validateCardLedger(state), Error, "40 physical cards");
});

Deno.test("card ledger rejects altered suit or rank data", () => {
  const state = ledgerState();
  state.deck[0] = { ...state.deck[0], rank: 10 };
  assertThrows(() => validateCardLedger(state), Error, "altered physical card");
});

Deno.test("build integrity accepts a valid two-player build", () => {
  const state = { builds: [{ id: "b1", value: 7, ownerSeat: 1, team: 1, cards: [allCards[2], allCards[13]] }] };
  validateBuildIntegrity(state, twoPlayers);
});

Deno.test("build integrity accepts partner top-ups that preserve the value", () => {
  const state = { builds: [{ id: "b1", value: 8, ownerSeat: 1, team: 1, cards: [
    { id: "a", suit: "♠", rank: 8 },
    { id: "b", suit: "♥", rank: 3 },
    { id: "c", suit: "♦", rank: 5 }
  ] }] };
  validateBuildIntegrity(state, twoPlayers);
});

Deno.test("build integrity rejects duplicate active build values", () => {
  const state = { builds: [
    { id: "b1", value: 7, ownerSeat: 1, team: 1, cards: [{ ...allCards[0], rank: 7 }] },
    { id: "b2", value: 7, ownerSeat: 2, team: 2, cards: [{ ...allCards[6], rank: 7 }] }
  ] };
  assertThrows(() => validateBuildIntegrity(state, twoPlayers), Error, "same value");
});

Deno.test("build integrity rejects a build assigned to the wrong team", () => {
  const state = { builds: [{ id: "b1", value: 7, ownerSeat: 1, team: 2, cards: [{ ...allCards[0], rank: 7 }] }] };
  assertThrows(() => validateBuildIntegrity(state, twoPlayers), Error, "team does not match");
});

Deno.test("build integrity permits two owned builds only during valid Shiya", () => {
  const state = {
    builds: [
      { id: "b1", value: 6, ownerSeat: 1, team: 1, cards: [{ ...allCards[0], rank: 6 }] },
      { id: "b2", value: 8, ownerSeat: 1, team: 1, cards: [{ ...allCards[1], rank: 8 }] }
    ],
    shiyaPending: { seat: 1, team: 1, buildIds: ["b1", "b2"] }
  };
  validateBuildIntegrity(state, fourPlayers);
});

Deno.test("build integrity rejects two owned builds without Shiya", () => {
  const state = { builds: [
    { id: "b1", value: 6, ownerSeat: 1, team: 1, cards: [{ ...allCards[0], rank: 6 }] },
    { id: "b2", value: 8, ownerSeat: 1, team: 1, cards: [{ ...allCards[1], rank: 8 }] }
  ] };
  assertThrows(() => validateBuildIntegrity(state, fourPlayers), Error, "two builds");
});


Deno.test("end-of-game award gives remaining loose floor cards to the last successful capturer", () => {
  const state = ledgerState();
  state.deck = state.deck.slice(0, 38);
  state.floor = [allCards[38], allCards[39]];
  state.lastCapturerSeat = 2;
  const awarded = awardRemainingFloorCards(state);
  assertEquals(awarded, 2);
  assertEquals(state.floor.length, 0);
  assertEquals(state.capturedPiles["2"].map((card: Card) => card.id), [allCards[38].id, allCards[39].id]);
  validateCardLedger(state);
});

Deno.test("drafting the matching value blocks only the partner for that captured build", () => {
  const captured: RecoverableBuild[] = [{
    id: "captured-1", value: 7, originalOwnerSeat: 1, originalTeam: 1,
    capturedBySeat: 2, status: "captured", partnerRecoveryBlocked: false
  }];
  blockPartnerRecoveryForDraft(captured, 1, 7);
  assertEquals(canRecoverCapturedBuild(captured[0], 1, 1), true);
  assertEquals(canRecoverCapturedBuild(captured[0], 3, 1), false);
  assertEquals(canRecoverCapturedBuild(captured[0], 2, 2), false);
});

Deno.test("a newly captured recovery build gives the partner a fresh recovery opportunity", () => {
  const earlier: RecoverableBuild = {
    id: "captured-1", value: 7, originalOwnerSeat: 1, originalTeam: 1,
    capturedBySeat: 2, status: "recovered", partnerRecoveryBlocked: true, recoveredBySeat: 1
  };
  const recapturedNewBuild: RecoverableBuild = {
    id: "captured-2", value: 7, originalOwnerSeat: 1, originalTeam: 1,
    capturedBySeat: 4, status: "captured", partnerRecoveryBlocked: false
  };
  assertEquals(canRecoverCapturedBuild(earlier, 3, 1), false);
  assertEquals(canRecoverCapturedBuild(recapturedNewBuild, 3, 1), true);
});

Deno.test("drafting does not block a different captured build value or a recovered record", () => {
  const captured: RecoverableBuild[] = [
    { id: "captured-7", value: 7, originalOwnerSeat: 1, originalTeam: 1, capturedBySeat: 2, status: "captured", partnerRecoveryBlocked: false },
    { id: "captured-8", value: 8, originalOwnerSeat: 1, originalTeam: 1, capturedBySeat: 2, status: "captured", partnerRecoveryBlocked: false },
    { id: "recovered-7", value: 7, originalOwnerSeat: 1, originalTeam: 1, capturedBySeat: 2, status: "recovered", partnerRecoveryBlocked: false }
  ];
  blockPartnerRecoveryForDraft(captured, 1, 7);
  assertEquals(captured.map((item) => item.partnerRecoveryBlocked), [true, false, false]);
});
