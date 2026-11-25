# Casino

A custom South African Casino card game. The mobile application is being developed with the same native stack used by AnySkill.

## Applications

- **Mobile:** React Native 0.88, Expo SDK 58, React 19.3, TypeScript 5.9.
- **Existing web prototype:** Next.js App Router (kept intact while the native app is developed).

## Run the mobile app

```bash
cd apps/mobile
npm install
npx expo start
```

Or from the repository root after installing the mobile dependencies:

```bash
npm run mobile
```

## Development principles

- `docs/rules/LOCKED_RULES.md` is the source of truth for confirmed game rules.
- The game engine must enforce the 40-card integrity ledger.
- Unspecified rules must remain unimplemented until clarified; do not import assumptions from other Casino variants.
- The existing Next.js prototype is retained during the mobile build so no working baseline is discarded.
