import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { CORE_PATHS, CORE_TOOLS } from "../src/curated.ts";
import { sanitizeName } from "../src/openapi.ts";

const coreNames = new Set([...CORE_PATHS].map((path) => sanitizeName("get", path)));

describe("core tool set", () => {
  it("stays small enough for an agent to choose from", () => {
    assert.ok(CORE_PATHS.size >= 30, `too few core tools: ${CORE_PATHS.size}`);
    assert.ok(CORE_PATHS.size < 50, `too many core tools: ${CORE_PATHS.size}`);
  });

  it("only routes to tools that exist in the core set", () => {
    for (const [path, text] of Object.entries(CORE_TOOLS)) {
      // `get_v2_media_info_*` style wildcards name a family, not one tool.
      for (const [, ref] of text.matchAll(/`(get_[a-z0-9_]+)`/g)) {
        assert.ok(coreNames.has(ref), `${path} refers to \`${ref}\`, which is not a core tool`);
      }
    }
  });

  it("does not describe a tool by pointing at itself", () => {
    for (const [path, text] of Object.entries(CORE_TOOLS)) {
      assert.ok(
        !text.includes(`\`${sanitizeName("get", path)}\``),
        `${path} refers to itself`,
      );
    }
  });

  it("says what each tool does, when to use it and what it costs", () => {
    for (const [path, text] of Object.entries(CORE_TOOLS)) {
      assert.match(text, /Instagram/, `${path} does not name the platform`);
      assert.match(text, /\b[Uu]se\b/, `${path} has no usage guidance`);
      assert.match(text, /billed/, `${path} does not mention billing`);
      assert.ok(text.length <= 700, `${path} description is ${text.length} chars`);
    }
  });
});
