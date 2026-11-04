import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SIBLING = fileURLToPath(
  new URL("../../../cognitive-companion/backend/_version.py", import.meta.url),
);

/**
 * The Cognitive Companion version for the nav bar, resolved at build time: CI sets CC_VERSION, and
 * a local build reads the sibling checkout. Nothing is committed, so it cannot go stale.
 */
export function ccVersion(env: Record<string, string | undefined> = process.env): string {
  if (env.CC_VERSION) return env.CC_VERSION;
  if (!existsSync(SIBLING)) return "dev";
  return /__version__ = "([^"]+)"/.exec(readFileSync(SIBLING, "utf8"))?.[1] ?? "dev";
}
