import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Execute both groups even if one fails. Keep all application tests discoverable
// so new safety regressions cannot silently be omitted from npm test.
const groups = [
  ["--test", "scripts/**/*.test.mjs"],
  ["--experimental-strip-types", "--import", "./scripts/test-support/register.mjs", "--test", "src/lib/**/*.test.ts"],
];
let failed = false;
for (const args of groups) {
  const result = spawnSync(process.execPath, args, {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    stdio: "inherit",
  });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
