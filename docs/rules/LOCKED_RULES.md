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

- Two players participate: Player 1 and Player 2.
- Player 1 starts Round 1.
- The player who starts Round 1 also starts Round 2.
- The mode consists of two rounds.
- Each player receives 10 cards per round.
- Round 2 uses the same universal dealing and deck-order rules in Section 3.

### 2.2 Four Hands

- Four players participate in one round.
- Each player receives 10 cards, for 40 cards in total.
- Partnerships are fixed:
  - Team 1: Player 1 and Player 3.
  - Team 2: Player 2 and Player 4.
- Turn order is Player 1 → Player 2 → Player 3 → Player 4, then repeats.

### 2.3 Starting floor — South African two- and four-player versions

- In both Two Hands (two-player) and Four Hands (four-player) modes, the floor starts empty.
- No cards are dealt face-up onto the floor during initial setup.

## 3. Shuffle and dealing algorithm

### 3.1 Universal dealing rule — every mode and every round

For every deal, regardless of game mode or round, deal **two cards to each player in player order**, then repeat that same order until every player has received 10 cards for that deal. Do not deal all 10 cards to one player before moving to the next player.

The player order is the normal player order for the mode:
- Two Hands: Player 1, then Player 2; repeat.
- Four Hands: Player 1, then Player 2, then Player 3, then Player 4; repeat.

This rule applies to the initial deal and every subsequent deal, including Round 2 in Two Hands.

The shuffle algorithm for **every shuffle performed in the game is Fisher–Yates**. This applies to each individual suit, the combined 40-card deck, and any other shuffle explicitly required by the game rules. Every random choice in every shuffle must come from a **cryptographically secure random number generator (CSPRNG)**. No other shuffle algorithm or random source may be substituted. This is the required algorithm, not merely a general instruction to shuffle.

Once the required shuffle of the combined 40-card deck is complete, its resulting card order must be preserved. Deal directly from that deck in its existing order, following the universal player dealing sequence. Do not reshuffle, reorder, sort, or otherwise alter the deck, dealt packets, or any player's hand after the deck shuffle. Each player's hand retains the order in which its cards were received from the deck. In Two Hands, Round 2 continues from the next cards in that same original deck order.

### 3.2 Fisher–Yates algorithm

For an array containing `n` cards:

1. Set the current index `i` to the last array index (`n - 1`).
2. Generate a uniformly distributed, cryptographically secure random integer `j` in the inclusive range `0..i`.
3. Swap the cards at indexes `i` and `j`.
4. Decrease `i` by one.
5. Repeat steps 2–4 until `i` reaches 1.

Use a CSPRNG-backed API such as Node.js `crypto.randomInt(0, i + 1)` (the upper bound is exclusive). Do not use `Math.random()` or a non-cryptographic/predictable random source.

### 3.3 Required initial 40-card deck shuffle

Perform these stages in this exact order:

1. Create the complete 40-card deck: Ace through 10 in Spades, Hearts, Diamonds, and Clubs.
2. Apply a separate, independent Fisher–Yates shuffle using fresh CSPRNG draws to the 10 cards in Spades.
3. Independently apply Fisher–Yates with fresh CSPRNG draws to the 10 cards in Hearts.
4. Independently apply Fisher–Yates with fresh CSPRNG draws to the 10 cards in Diamonds.
5. Independently apply Fisher–Yates with fresh CSPRNG draws to the 10 cards in Clubs.
6. **After all four suits have each been shuffled, combine the four shuffled suits into one 40-card deck in this exact order: Spades, Hearts, Diamonds, then Clubs.**

After combining the four independently shuffled suits, apply Fisher–Yates one more time to the complete 40-card deck, using fresh CSPRNG draws. **Both stages are mandatory: shuffle each suit separately, then shuffle the combined 40-card deck.** Do not combine the suits before their individual shuffles are complete.

### 3.4 Mode-specific dealing notes

- Four Hands: Player 1 is the first dealer and first player. The universal dealing rule in Section 3.1 gives each of the four players 10 cards over five cycles.
- Two Hands: Player 1 starts Round 1. The same player who started Round 1 starts Round 2. Both rounds use the universal dealing rule in Section 3.1. Round 2 does not involve a new shuffle; continue from the next cards in the preserved original deck order.

### 3.5 Mandatory shuffle and deal validation

Before play begins, validate that:

- The deck contains exactly 40 cards.
- Every one of the 40 valid suit/rank combinations appears exactly once.
- There are exactly 10 cards of each suit.
- No Jacks, Queens, Kings, duplicate cards, or missing cards exist.
- In Four Hands, each player has exactly 10 cards after dealing.
- Each player's hand contains no duplicate physical card.
- The floor is empty at the start of both Two Hands and Four Hands.

If any validation fails, discard the invalid deck/deal and restart the complete setup; do not begin play with an invalid deck or hand.

Do not change the algorithms, dealing order, or shuffle stages without explicit approval from the game owner.

## 4. Playing rules

The playing rules include Drafting, Build, Capture, Recover, and Partner Assist. A turn may contain multiple legal actions; a player is not limited to one action per turn. Every action must follow the card-integrity and ownership rules in this document.

### 4.1 Drafting

- A player may play a card from their hand face-up onto the floor without building or capturing.
- This action is called **Drafting**.
- A drafted card becomes a loose floor card and is not part of a build or any player's captured collection.

### 4.2 Build

Building and capturing are different actions.

- A build's value cannot exceed 10.
- Normally, a player may own no more than one active build at a time.
- The Shiya exception in this section may temporarily give a player ownership of two active builds during the same turn.
- Two active builds may not have the same value.

- **Create a build:** A player combines cards genuinely available from their own hand with eligible loose cards on the floor and, where expressly permitted, eligible visible top cards from opponents' captured-card piles. A valid build value cannot exceed 10. Cards already committed to an active build are not loose or available cards and cannot be reused as the foundation for another build.
- **Using opponents' captured-pile cards when creating a build:** A player may also use eligible visible top cards from opponents' captured-card piles in the combination that creates a new build, but only if at least one active build already exists on the floor. This condition is satisfied even when that active build was created earlier in the same turn. The player may combine their own card(s) with eligible opponent-pile top card(s) to make the new build value.
- **Example — creating a build with opponent-pile cards:** If an opponent's captured pile has a 2 on top, another opponent's captured pile has a 4 on top, and the player holds an Ace (1), the player may combine 1 + 2 + 4 = 7 to create a new build valued at 7, provided at least one active build already exists on the floor. A separate loose 5 on the floor is not part of that combination.
- A player may use one card, two cards, three cards, four cards, or more in a valid combination, provided every card is genuinely available for that action. Cards committed to an active build cannot be counted again or reused to create another build.
- **A player cannot create a build with a value that is already represented by a card on the floor.** Check the current floor before creating the build; if a floor card already has that value, the build cannot be created at that value.
- A player may create and build their own build.
- A player may assist by adding further valid combinations to their partner's existing build to maintain/top it. These additions belong to the partner's existing build; they do not make the assisting player its individual owner. Cards already committed to that build remain committed to it and cannot also be used as the foundation for another build.
- A top-up to an existing build may be made in either of these ways: (a) one added card individually equals the build value, or (b) two or more added cards combine to equal the build value. For example, a build valued at 8 may be topped up with one 8, or with 3 + 5.
- A top-up must preserve the existing build value; it must not change that value.
- A player cannot create, build, or add to an opponent's existing build. Adding cards to another player's build does not transfer or change its individual ownership.
- Every card used in a build or top-up action must be genuinely held by the player or legitimately available on the table/build. A player cannot use a card they do not have.

**Example:** If Player 1 finds a 2 on the floor and uses a 5 from their hand, Player 1 creates a build of 7.

A build has both:
- **An individual owner:** the player who owns the build.
- **A team affiliation:** the partnership the build belongs to.

These are distinct. Team affiliation does not automatically give the partner individual ownership or the right to capture.

### 4.3 Capture

- **Direct single-card capture:** A player may capture one eligible loose floor card directly, without an existing build, by playing a card of the same value from their hand. Both cards are collected by the capturing player.
- **Capture a build:** A player may capture a build by making a combination whose total value matches the build value.
- A capture combination must include at least one card from the capturing player's own hand. The player may combine that hand card or cards with eligible loose cards on the floor and/or visible top cards from opponents' captured-card piles. Cards already committed to an active build cannot be reused as capture contributions. A player cannot capture using only cards they do not hold or control for that action.
- **Example — loose floor cards:** If a build is worth 8 and the floor has loose cards 2 and 6, the player may combine 2 + 6 = 8 to capture the build. The player takes the entire build and also collects both the 2 and the 6 used in the combination.
- **Example — opponents' captured piles:** If the visible top cards of opponents' captured-card piles are 3 and 5, the player may combine 3 + 5 = 8 to capture a build worth 8.
- **Example — mixed locations:** If an eligible visible top card in an opponent's captured pile is 7 and a loose floor card is 1, the player may combine 7 + 1 = 8 to capture a build worth 8.
- A player may capture their own build or an opponent's build, provided they can make the required matching combination using eligible cards.
- A player cannot directly capture their partner's build while the partner remains its individual owner.
- **Shiya:** A player may Shiya their partner's build. Shiya immediately transfers individual ownership of that build to the player performing Shiya; no additional card contribution is required for the transfer. Once ownership has transferred, that player may capture the build.
- A player may Shiya their partner's build even if they already own an active build. This may temporarily leave them owning two active builds.
- If a player owns two builds because of Shiya, they must capture at least one of those builds during that same turn. If they capture one, their turn ends immediately; the other build remains active under their ownership. They are not required to capture both builds.
- If, instead of capturing at least one of those two builds, the player plays something else, the game ends immediately and the opposing team is awarded all 11 points.
- Shiya is an ownership transfer, not a capture by itself. Do not require a card contribution to perform Shiya.
- A capture collects the entire build, including its original cards and all additions made to it.
- All cards used in the capture combination are collected as part of the capture.
- Cards used from the floor or opponents' captured-card piles must be removed from their previous locations and recorded in the capturing player's collection.
- Only the top card of each opponent's captured-card pile is visible and eligible to use in a combination. When that top card is used, the next card underneath becomes the visible top card and is then eligible to use.
- Never count a card both as part of a build and as collected.

### 4.4 Recover

- If an opposing team captures a team's build, either member of the original team may recover it.
- **Recovery timing:** Recovery may be attempted during either member of the original team's turn.
- **Recovery follows the complete build-creation rules in Section 4.2:** it is a new build of the captured build's value, and every normal build-creation requirement and restriction applies. This includes the required contribution from the recovering player's own hand, eligible loose floor cards, the conditions for using visible top cards from opponents' captured piles, the maximum value, duplicate-value restrictions, and the rule against creating a build when that value is already represented by a floor card. The recovering player does not need a single matching card in hand; they may use any valid build combination.
- **Captured cards stay captured:** recovery does not return, remove, or transfer any cards from the opponent's captured pile. The original captured build remains in that pile. Only the cards used for the recovery combination form the new active build.
- **Ownership:** the player who creates the new build through recovery becomes its individual owner. It does not automatically belong to the original owner of the captured build.
- **Original-owner draft restriction:** If the original individual owner drafts a loose floor card whose value matches the captured build's value, their partner can no longer recover that captured build. The restriction is based on card value, not suit or physical card identity. The original owner may still recover it, and the partner may still create a separate new build of that value using a valid combination.
- The new recovery build belongs to the recovering player's team.
- A captured build may be recovered more than once. Each successful recovery creates a new active build; it is not the old active build returning from the captured pile.
- The original-owner draft restriction applies to the captured build instance for which the matching-value card was drafted. If that build is recovered and the new recovery build is later captured, the partner gets a fresh opportunity to recover that newly captured build. An earlier draft does not permanently block the partner from recovering a later, newly created build.
- Every later recovery remains subject to all recovery and normal build-creation rules above.

A loose card is not automatically a team build: if Player 1 plays a 7 as a loose card onto the floor, Player 3 cannot recover that loose card as a team build. Player 3 may still use that 7 to create a build if they have the necessary cards.

### 4.5 Partner Assist

- A partner may assist with maintaining/topping their teammate's team build if they have the required cards.
- A partner cannot capture that build while their teammate remains its individual owner.
- A partner may ask the current individual owner to pass the build to them.
- The current owner decides whether to grant the request.
- If the owner grants the pass, individual ownership transfers to the partner.
- The new owner may then capture the build, provided they can make the required matching combination using eligible cards.
- A partner does not automatically receive ownership.
- Shiya is the separately confirmed exception: it transfers ownership immediately as described in Section 4.2 and does not require the current owner to grant a request.
- Do not describe an ordinary ownership transfer by request as something the partner can initiate unilaterally.

## 5. Loose cards at the end of play

- Loose cards are cards on the floor that are not part of an active build.
- At the end of play, the **last player to successfully capture** takes the remaining loose cards.
- This is the last successful capturer, not necessarily the last player who played a card.
- Loose cards are not team-owned builds.

## 6. Scoring values established so far

The following category values have been stated:

| Scoring category | Points |
|---|---:|
| Four Aces | 4 |
| Big 10 (dice-related category) | 1 |
| 6 of Spades (6♠) | 1 |
| Most cards collected | 2 |
| Spy 2 (2♠) | 1 |
| 20+ category (including exactly 20) | 2 |

### 20+ category and tie

- The 20+ category is worth 2 points in total.
- If one team qualifies for the 20+ category, that team receives all 2 points.
- If both teams have exactly 20, they share the 2 points: 1 point each.
- This is one combined 20+ scoring category; do not score “More than 21” and “Exactly 20” as two separate categories.

### Team scoring in Four Hands

- Each partner's scoring points are added together to produce their partnership's team score.

**Scoring total:** With the combined 20+ category, the listed categories total 11 points: 4 + 1 + 1 + 2 + 1 + 2 = 11. The exact calculation method used to determine a team's 20+ total has not yet been specified; do not invent it.
- The exact dice procedure or condition for awarding the Big 10 point has not yet been specified in this file; do not invent it.

---

## 7. Mandatory card-integrity rules for every simulation and implementation

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
3. Any combination used to build or capture is valid; every card must be genuinely available and used only once. A capture combination must include at least one card from the player's hand, may include eligible loose floor cards and visible top cards from opponents' captured-card piles, and must match the build value.
4. The action respects individual ownership and partnership rules.
5. No card has already been used, captured, or moved elsewhere.

After every move, reconcile the complete card ledger. If any check fails, stop immediately at that move. Do not continue from an invalid state or conceal the discrepancy.

## 8. Change control

- These are locked rules, not suggestions.
- Do not infer missing rules from common Casino variants or from another card game.
- Do not change a rule to make a simulation or software implementation easier.
- If a rule is unclear or not documented, mark it as unspecified and ask the game owner.
- When the game owner explicitly changes or clarifies a rule, update this file and record the change in the Git history.

### 3.6 Private hands and player visibility

- Each player may see their own hand face-up on their own screen.
- A player must not be able to see any other player's hand.
- The interface must keep each player's hand private from the other players.

