# Casino — Locked Game Rules

**Status:** Locked rules only  
**Document purpose:** Single source of truth for rules explicitly established by the game owner.  
**Change control:** Do not reinterpret, silently modify, or fill gaps in these rules. A change requires explicit approval from the game owner.

This document records confirmed rules. Anything not stated here is not permission to invent a rule.

---

## 1. Deck and card values

- The game uses exactly 40 cards.
- There are four suits: Spades (♠), Hearts (♥), Diamonds (♦), and Clubs (♣).
- Each suit contains Ace, 2, 3, 4, 5, 6, 7, 8, 9, and 10.
- There are no Jacks, Queens, or Kings.
- Ace has a value of 1.
- A physical card may exist in only one game location at a time. It must never be duplicated, invented, or used twice.

## 2. Game modes

The game has two modes:

1. **Two Hands**
2. **Four Hands**

### 2.1 Two Hands

- Two players participate.
- The mode consists of two rounds.
- Each player receives 10 cards per round.
- Do not shuffle again before Round 2. Continue with the original deck order.
- For the Round 2 deal, deal two cards to Player 1, then two cards to Player 2, and repeat that order until each player has 10 cards.

### 2.2 Four Hands

- Four players participate in one round.
- Each player receives 10 cards, for 40 cards in total.
- Partnerships are fixed:
  - Team 1: Player 1 and Player 3.
  - Team 2: Player 2 and Player 4.
- Turn order is Player 1 → Player 2 → Player 3 → Player 4, then repeats.
- The floor starts empty.

## 3. Shuffle and dealing algorithm

The shuffle algorithm is **Fisher–Yates**, and every random choice must come from a **cryptographically secure random number generator (CSPRNG)**. This is the required algorithm, not merely a general instruction to shuffle.

### 3.1 Fisher–Yates algorithm

For an array containing `n` cards:

1. Set the current index `i` to the last array index (`n - 1`).
2. Generate a uniformly distributed, cryptographically secure random integer `j` in the inclusive range `0..i`.
3. Swap the cards at indexes `i` and `j`.
4. Decrease `i` by one.
5. Repeat steps 2–4 until `i` reaches 1.

Use a CSPRNG-backed API such as Node.js `crypto.randomInt(0, i + 1)` (the upper bound is exclusive). Do not use `Math.random()` or a non-cryptographic/predictable random source.

### 3.2 Required initial 40-card deck shuffle

Perform these stages in this exact order:

1. Create the complete 40-card deck: Ace through 10 in Spades, Hearts, Diamonds, and Clubs.
2. Apply a separate, independent Fisher–Yates shuffle using fresh CSPRNG draws to the 10 cards in Spades.
3. Independently apply Fisher–Yates with fresh CSPRNG draws to the 10 cards in Hearts.
4. Independently apply Fisher–Yates with fresh CSPRNG draws to the 10 cards in Diamonds.
5. Independently apply Fisher–Yates with fresh CSPRNG draws to the 10 cards in Clubs.
6. **After all four suits have each been shuffled, combine the four shuffled suits into one 40-card deck.**
7. Apply Fisher–Yates again to the complete 40-card deck, using fresh CSPRNG draws.

Do not combine the suits before their individual shuffles are complete. Do not omit the final shuffle of the combined 40-card deck.

### 3.3 Four Hands dealing algorithm

1. Player 1 is the first dealer.
2. Deal two cards to Player 1, then two to Player 2, then two to Player 3, then two to Player 4.
3. Repeat the same P1 → P2 → P3 → P4 order for five cycles, giving each player 10 cards.
4. Independently Fisher–Yates-shuffle each player's 10-card hand using CSPRNG draws before play.

### 3.4 Two Hands dealing and Round 2

- For the Two Hands mode, deal two cards to Player 1, then two to Player 2, repeating until each player has 10 cards for the round.
- Do not perform a new shuffle before Round 2. Continue with the original deck order and repeat the two-cards-to-Player-1, then two-cards-to-Player-2 dealing sequence until each player has 10 cards for Round 2.

### 3.5 Mandatory shuffle and deal validation

Before play begins, validate that:

- The deck contains exactly 40 cards.
- Every one of the 40 valid suit/rank combinations appears exactly once.
- There are exactly 10 cards of each suit.
- No Jacks, Queens, Kings, duplicate cards, or missing cards exist.
- In Four Hands, each player has exactly 10 cards after dealing.
- Each player's hand contains no duplicate physical card.

If any validation fails, discard the invalid deck/deal and restart the complete setup; do not begin play with an invalid deck or hand.

Do not change the algorithms, dealing order, or shuffle stages without explicit approval from the game owner.

## 4. Builds: creation and use

Building and capturing are different actions.

- **Create a build:** A player combines cards genuinely available from their own hand with eligible cards on the floor or in an existing build, as permitted by the build rules.
- **Capture a build:** A player uses a card or a valid combination from their hand that matches the build value to collect that build.
- A player may use one card, two cards, three cards, four cards, or more in a valid combination, if those cards are actually available to that player.
- A player may create or build on their own build, their partner's build, or an opponent's build, subject to the ownership and build rules below.
- A player may add further combinations onto an existing team build to assist in maintaining/topping that build. These additions belong to the existing build; do not silently treat them as separate independent builds.
- A player can capture their own build.
- Every card used in a create, top-up, or capture action must be genuinely held by the player or legitimately available on the table/build. A player cannot use a card they do not have.

### Example: creating a build

If Player 1 finds a 2 on the floor and uses a 5 from their hand, Player 1 creates a build of 7.

## 5. Individual ownership and team affiliation

A build has both:

- **An individual owner:** the player who owns the build.
- **A team affiliation:** the partnership the build belongs to.

These are distinct. Team affiliation does not automatically give the partner individual ownership or the right to capture.

### 5.1 Partner assistance

- A partner may assist with maintaining/topping their teammate's team build if they have the required cards.
- A partner cannot capture that build while their teammate remains its individual owner.

### 5.2 Request-based ownership pass

- A partner may ask the current individual owner to pass the build to them.
- The current owner decides whether to grant the request.
- If the owner grants the pass, individual ownership transfers to the partner.
- The new owner may then capture the build, provided they have the required card or valid combination.
- A partner does not automatically receive ownership.
- Do not describe ownership transfer as something the partner can initiate unilaterally.

### 5.3 Opponent interaction

- An opponent may capture a build at any time if they have the required card or a valid combination.
- If an opposing team captures a team's build, the original team has a right to recover it under the recovery rule.
- Do not invent the exact timing or sequence of recovery; implement only the recovery procedure once it has been fully specified.

### 5.4 Loose card versus team build

If Player 1 plays a 7 as a loose card onto the floor, Player 3 cannot recover that loose card as a team build. Player 3 may still use that 7 to create a build if they have the necessary cards.

## 6. Capturing and collected cards

- A capture collects the entire build, including its original cards and all additions made to it.
- The card or cards used to capture the build are also collected.
- Captured cards must be removed from the floor/build and recorded in the capturing player's collection.
- Never count a card both as part of a build and as collected.
- Never allow a player to capture a partner's build while the partner remains its individual owner.

## 7. Loose cards at the end of play

- Loose cards are cards on the floor that are not part of an active build.
- At the end of play, the **last player to successfully capture** takes the remaining loose cards.
- This is the last successful capturer, not necessarily the last player who played a card.
- Loose cards are not team-owned builds.

## 8. Scoring values established so far

The following category values have been stated:

| Scoring category | Points |
|---|---:|
| Four Aces | 4 |
| Big 10 | 1 |
| 6 of Spades (6♠) | 1 |
| Most cards collected | 2 |
| Spy 2 (2♠) | 1 |
| More than 21 (21+) | 2 |
| Exactly 20 | 2 |

### Exactly 20 tie

- Exactly 20 is worth 2 points in total.
- If two players tie at exactly 20, they share those 2 points: 1 point each.

**Scoring integrity note:** The game owner has stated that the overall scoring pool is 11 points. The category values listed above add to 13 points. Do not silently change any category value or the stated total. The discrepancy and any remaining scoring definitions must be resolved by the game owner before final scoring logic is treated as complete.

---

## 9. Mandatory card-integrity rules for every simulation and implementation

Every card must be accounted for in exactly one place:

- A player's hand;
- a loose card on the floor;
- an active build; or
- a player's captured collection.

At all times:

**Cards in all hands + loose floor cards + cards in active builds + all captured collections = 40.**

Before accepting a move, validate:

1. The player actually holds every card they intend to play.
2. Every floor/build card used is present and eligible.
3. The combination and build/capture value are valid.
4. The action respects individual ownership and partnership rules.
5. No card has already been used, captured, or moved elsewhere.

After every move, reconcile the complete card ledger. If any check fails, stop immediately at that move. Do not continue from an invalid state or conceal the discrepancy.

## 10. Change control

- These are locked rules, not suggestions.
- Do not infer missing rules from common Casino variants or from another card game.
- Do not change a rule to make a simulation or software implementation easier.
- If a rule is unclear or not documented, mark it as unspecified and ask the game owner.
- When the game owner explicitly changes or clarifies a rule, update this file and record the change in the Git history.
