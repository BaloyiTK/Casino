# Casino

A browser-based, pass-and-play implementation of our custom Casino card game.

## Stack
- Next.js App Router
- React + TypeScript
- CSS (custom responsive design)

## Run locally
```bash
npm install
npm run dev
```

## Current implementation
- Two Hands and Four Hands game setup
- 40-card deck (Ace–10, four suits)
- Cryptographically random Fisher–Yates shuffling
- Initial dealing and empty starting table
- Pass-and-play turn tracking
- Drafting cards from a player's hand onto the table
- Two Hands second deal using the remaining deck order

Rules will be refined as we test actual play. Unresolved mechanics are deliberately not guessed or silently implemented.
