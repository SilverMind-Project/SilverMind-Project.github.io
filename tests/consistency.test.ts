import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guards against the drift found in the July 2026 review: the docs site
// claimed 23 step types in one place and 14 in another, neither matching
// the 24 actually registered, and documented two step types
// (recamera_media_poll, cts_window_poll) that had been removed from the
// product. docs/.manifest.json is the checked-in source of truth for the
// counts the docs are allowed to state; update it in the same commit that
// legitimately changes a count.

const DOCS_ROOT = join(import.meta.dirname, "..", "docs");
const manifest = JSON.parse(
  readFileSync(join(DOCS_ROOT, ".manifest.json"), "utf-8"),
) as {
  step_types: number;
  channels: number;
  filters: number;
  trigger_types: number;
};

function listMarkdownFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf-8" })
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => join(dir, entry));
}

const markdownFiles = listMarkdownFiles(DOCS_ROOT);

function findCountMismatches(pattern: RegExp, expected: number): string[] {
  const mismatches: string[] = [];
  for (const file of markdownFiles) {
    const text = readFileSync(file, "utf-8");
    for (const match of text.matchAll(pattern)) {
      const found = Number(match[1]);
      if (found !== expected) {
        mismatches.push(`${file}: "${match[0]}" says ${found}, manifest says ${expected}`);
      }
    }
  }
  return mismatches;
}

describe("docs/.manifest.json consistency", () => {
  it("every 'N (pipeline )?step types' mention matches the manifest", () => {
    const mismatches = findCountMismatches(/(\d+)\s+(?:pipeline\s+)?step types/g, manifest.step_types);
    expect(mismatches).toEqual([]);
  });

  it("every 'N notification channels' mention matches the manifest", () => {
    const mismatches = findCountMismatches(/(\d+) notification channels/g, manifest.channels);
    expect(mismatches).toEqual([]);
  });

  it("every 'N context filters' mention matches the manifest", () => {
    const mismatches = findCountMismatches(/(\d+) context filters/g, manifest.filters);
    expect(mismatches).toEqual([]);
  });

  it("every 'N trigger types' mention matches the manifest", () => {
    const mismatches = findCountMismatches(/(\d+) trigger types/g, manifest.trigger_types);
    expect(mismatches).toEqual([]);
  });

  it("removed step type identifiers only appear in sentences noting they were removed", () => {
    const removedIdentifiers = ["recamera_media_poll", "cts_window_poll"];
    const offenders: string[] = [];
    for (const file of markdownFiles) {
      const text = readFileSync(file, "utf-8");
      for (const identifier of removedIdentifiers) {
        if (!text.includes(identifier)) continue;
        // Split on sentence-ish boundaries and check each occurrence's
        // sentence mentions removal.
        const sentences = text.split(/(?<=[.!?])\s+/);
        for (const sentence of sentences) {
          if (sentence.includes(identifier) && !/removed/i.test(sentence)) {
            offenders.push(`${file}: ${JSON.stringify(sentence.trim())}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
