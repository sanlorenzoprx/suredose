import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("application tests still run after script failures, while npm test fails overall", () => {
  const root = mkdtempSync(join(tmpdir(), "suredose-test-runner-"));
  try {
    mkdirSync(join(root, "scripts"));
    mkdirSync(join(root, "src/lib"), { recursive: true });
    copyFileSync(new URL("./test.mjs", import.meta.url), join(root, "scripts/test.mjs"));
    writeFileSync(
      join(root, "scripts/failure.test.mjs"),
      'import { test } from "node:test"; test("failure", () => { throw Error("expected failure"); });',
    );
    writeFileSync(
      join(root, "src/lib/probe.test.ts"),
      'import { writeFileSync } from "node:fs"; writeFileSync("app-tests-ran", "yes");',
    );
    // Run as npm would, outside this test worker's private child-process context.
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [join(root, "scripts/test.mjs")], {
      encoding: "utf8",
      env,
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(existsSync(join(root, "app-tests-ran")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
