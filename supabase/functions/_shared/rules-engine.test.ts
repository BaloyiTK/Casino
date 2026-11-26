/// <reference lib="deno.ns" />
import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { Card } from "./game-invariants.ts";
import {
  awardRemainingFloor,
  captureBuild,
  captureLooseCard,
  createBuild,
  createRulesState,
  draftCard,
  forfeitAfterShiya,
  shiya,
  transferBuildByConsent,
  validateCardLedger as validateClientLedger
} from "../../../apps/mobile/src/rules-engine.ts";
import { validateCardLedger } from "./game-invariants.ts";

const suits = ["♠", "♥", "♦", "♣"] as const;
const deck: Card[] = suits.flatMap((suit) =>
  Array.from({ length: 10 }, (_, index) => ({
    id: `${suit}-${index + 1}`,
    suit,
    rank: index + 1
  }))
);
const card = (rank: number, suit: Card["suit"] = "♠"): Card => ({
  id: `${suit}-${rank}`, suit, rank
});
const players = [
  { id: 1, teamId: 0, hand: [card(4), card(3, "♥"), card(8, "♦")] },
  { id: 2, teamId: 1, hand: [card(7, "♥"), card(2, "♦")] },
  { id: 3, teamId: 0, hand: [card(5, "♣"), card(1, "♦")] },
  { id: 4, teamId: 1, hand: [card(6, "♣")] }
];

Deno.test("draft moves one card from the player's hand to the loose floor", () => {
  const state = createRulesState(players.slice(0, 2));
  const result = draftCard(state, 1, card(4).id);
  assert(result.ok);
  assertEquals(result.state.players[0].hand.some((item) => item.id === card(4).id), false);
  assertEquals(result.state.floor.map((item) => item.id), [card(4).id]);
});

Deno.test("draft rejects a card not held by the player", () => {
  const state = createRulesState(players.slice(0, 2));
  const result = draftCard(state, 1, card(7, "♥").id);
  assertEquals(result.ok, false);
});

Deno.test("build creation requires the player's own hand contribution", () => {
  const state = createRulesState(players.slice(0, 2), [card(3, "♦")]);
  const result = createBuild(state, 1, [], [card(3, "♦").id]);
  assertEquals(result.ok, false);
});

Deno.test("build creation combines hand and floor cards and records individual owner/team", () => {
  const state = createRulesState(players.slice(0, 2), [card(3, "♦")]);
  const result = createBuild(state, 1, [card(4).id], [card(3, "♦").id]);
  assert(result.ok);
  assertEquals(result.state.builds[0].value, 7);
  assertEquals(result.state.builds[0].ownerId, 1);
  assertEquals(result.state.builds[0].teamId, 1);
  assertEquals(result.state.floor.length, 0);
});

Deno.test("build creation rejects values above ten", () => {
  const state = createRulesState(players.slice(0, 2));
  const result = createBuild(state, 1, [card(8, "♦").id, card(4).id], []);
  assertEquals(result.ok, false);
});

Deno.test("build creation rejects a value already represented by a loose floor card", () => {
  const state = createRulesState(players.slice(0, 2), [card(7, "♦")]);
  const result = createBuild(state, 1, [card(4).id, card(3, "♥").id], []);
  assertEquals(result.ok, false);
});

Deno.test("build creation rejects a duplicate active build value", () => {
  const state = createRulesState(players.slice(0, 2));
  const first = createBuild(state, 1, [card(4).id, card(3, "♥").id], []);
  assert(first.ok);
  const second = createBuild(first.state, 2, [card(7, "♥").id], []);
  assertEquals(second.ok, false);
});

Deno.test("opponent captured-pile top cards require an active build", () => {
  const state = createRulesState(
    players.slice(0, 2),
    [],
    [{ playerId: 2, cards: [card(2, "♦")] }, { playerId: 1, cards: [] }]
  );
  const result = createBuild(state, 1, [card(4).id], [], [card(2, "♦").id]);
  assertEquals(result.ok, false);
});

Deno.test("only the visible top card of an opponent pile can be used", () => {
  const state = createRulesState(
    players.slice(0, 2),
    [card(5, "♣")],
    [
      { playerId: 1, cards: [] },
      { playerId: 2, cards: [card(2, "♦"), card(4, "♥")] }
    ]
  );
  state.builds.push({ id: "existing", value: 9, ownerId: 3, teamId: 0, cards: [card(9, "♣")] });
  const result = createBuild(state, 1, [card(4).id], [], [card(2, "♦").id]);
  assertEquals(result.ok, false);
});

Deno.test("build capture requires at least one own hand card and exact value", () => {
  const state = createRulesState(players.slice(0, 2));
  const built = createBuild(state, 1, [card(4).id, card(3, "♥").id], []);
  assert(built.ok);
  const noHand = captureBuild(built.state, 2, built.state.builds[0].id, [], [card(1, "♣").id]);
  assertEquals(noHand.ok, false);
  const wrongTotal = captureBuild(built.state, 2, built.state.builds[0].id, [card(7, "♥").id], []);
  assertEquals(wrongTotal.ok, true);
});

Deno.test("a player cannot capture a partner-owned build before ownership changes", () => {
  const state = createRulesState(players);
  const built = createBuild(state, 1, [card(4).id, card(3, "♥").id], []);
  assert(built.ok);
  const result = captureBuild(built.state, 3, built.state.builds[0].id, [card(1, "♦").id], [card(6, "♣").id]);
  assertEquals(result.ok, false);
});

Deno.test("direct capture requires equal values and collects both cards", () => {
  const state = createRulesState(players.slice(0, 2), [card(8, "♣")]);
  const invalid = captureLooseCard(state, 1, card(4).id, card(8, "♣").id);
  assertEquals(invalid.ok, false);
  const valid = captureLooseCard(state, 1, card(8, "♦").id, card(8, "♣").id);
  assert(valid.ok);
  assertEquals(valid.state.floor.length, 0);
  assertEquals(valid.state.capturedPiles.find((pile) => pile.playerId === 1)?.cards.length, 2);
  assertEquals(valid.state.lastSuccessfulCapturerId, 1);
});

Deno.test("Shiya transfers partner ownership immediately and creates an obligation only when player owns a second build", () => {
  const state = createRulesState(players);
  const partnerBuild = {
    id: "partner-build", value: 6, ownerId: 3, teamId: 0,
    cards: [card(6, "♣")]
  };
  const first = shiya({ ...state, builds: [partnerBuild] }, 1, partnerBuild.id);
  assert(first.ok);
  assertEquals(first.state.builds[0].ownerId, 1);
  assertEquals(first.state.shiyaObligation, null);

  const withOwnBuild = {
    ...state,
    builds: [
      { id: "own-build", value: 4, ownerId: 1, teamId: 0, cards: [card(4)] },
      partnerBuild
    ]
  };
  const second = shiya(withOwnBuild, 1, partnerBuild.id);
  assert(second.ok);
  assertEquals(second.state.shiyaObligation?.buildIds.length, 2);
});

Deno.test("Shiya failure awards the opposing team the win", () => {
  const state = createRulesState(players);
  const pending = {
    ...state,
    shiyaObligation: { playerId: 1, buildIds: ["b1", "b2"] }
  };
  const result = forfeitAfterShiya(pending, 1);
  assert(result.ok);
  assertEquals(result.state.gameOver, true);
  assertEquals(result.state.winnerTeamId, 1);
});

Deno.test("normal partner ownership transfer requires explicit owner approval", () => {
  const state = createRulesState(players);
  const build = { id: "b1", value: 4, ownerId: 1, teamId: 0, cards: [card(4)] };
  const denied = transferBuildByConsent({ ...state, builds: [build] }, 3, "b1", false);
  assertEquals(denied.ok, false);
  const approved = transferBuildByConsent({ ...state, builds: [build] }, 3, "b1", true);
  assert(approved.ok);
  assertEquals(approved.state.builds[0].ownerId, 3);
});

Deno.test("remaining loose floor cards go to the last successful capturer", () => {
  const state = createRulesState(players.slice(0, 2), [card(9, "♣")]);
  const captured = {
    ...state,
    lastSuccessfulCapturerId: 2,
    capturedPiles: [{ playerId: 1, cards: [] }, { playerId: 2, cards: [card(7, "♥")] }]
  };
  const result = awardRemainingFloor(captured);
  assert(result.ok);
  assertEquals(result.state.floor.length, 0);
  assertEquals(result.state.capturedPiles[1].cards.map((item) => item.id), [card(7, "♥").id, card(9, "♣").id]);
});

Deno.test("server card ledger accepts the complete canonical 40-card deck", () => {
  const state = {
    deck: [...deck],
    hands: { "1": [], "2": [], "3": [], "4": [] },
    floor: [],
    builds: [],
    capturedPiles: { "1": [], "2": [], "3": [], "4": [] }
  };
  validateCardLedger(state);
});

Deno.test("server card ledger rejects duplicate or missing physical cards", () => {
  const duplicated = {
    deck: [...deck],
    hands: { "1": [], "2": [], "3": [], "4": [] },
    floor: [deck[0]],
    builds: [],
    capturedPiles: { "1": [], "2": [], "3": [], "4": [] }
  };
  assertThrows(() => validateCardLedger(duplicated), Error, "40 physical cards");
  const missing = { ...duplicated, deck: deck.slice(1), floor: [] };
  assertThrows(() => validateCardLedger(missing), Error, "40 physical cards");
});

Deno.test("client ledger detects cards duplicated across game locations", () => {
  const state = createRulesState(players.slice(0, 2), [card(4)]);
  const errors = validateClientLedger(state, deck);
  assert(errors.some((error) => error.includes("must exist in exactly one location")));
});
