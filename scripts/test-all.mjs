import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const checks = [
  {
    name: "React Native / Expo TypeScript",
    command: npm,
    args: ["run", "mobile:typecheck"]
  },
  {
    name: "Supabase Edge Function typecheck",
    command: "deno",
    args: [
      "check",
      "apps/api/supabase/functions/game-session/index.ts",
      "apps/api/supabase/functions/game-action/index.ts"
    ]
  },
  {
    name: "Shuffle and dealing tests",
    command: "deno",
    args: ["test", "apps/api/supabase/functions/_shared/shuffle-deal.test.ts"]
  },
  {
    name: "Game invariant and recovery tests",
    command: "deno",
    args: ["test", "apps/api/supabase/functions/_shared/game-invariants.test.ts"]
  },
  {
    name: "Gameplay rules regression tests",
    command: "deno",
    args: ["test", "apps/api/supabase/functions/_shared/rules-engine.test.ts"]
  }
];

for (const check of checks) {
  console.log(`\n\n========== ${check.name} ==========`);
  const result = spawnSync(check.command, check.args, {
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (result.error) {
    console.error(`Could not start ${check.name}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`\nFAILED: ${check.name} (exit ${result.status ?? "unknown"})`);
    process.exit(result.status ?? 1);
  }
  console.log(`PASSED: ${check.name}`);
}

console.log("\nAll configured Casino checks passed.");
