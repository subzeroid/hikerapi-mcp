import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildTools,
  buildUrl,
  isTrustedUrl,
  mergeParameters,
  resolveParameter,
  sanitizeName,
  shouldIncludeOperation,
  type OpenApiSpec,
} from "../src/openapi.ts";

describe("sanitizeName", () => {
  it("converts REST paths into tool names", () => {
    assert.equal(sanitizeName("get", "/v2/user/by/username"), "get_v2_user_by_username");
    assert.equal(sanitizeName("get", "/v1/hashtag/medias/top/chunk"), "get_v1_hashtag_medias_top_chunk");
  });

  it("strips braces around path parameters", () => {
    assert.equal(sanitizeName("get", "/users/{id}/posts"), "get_users_id_posts");
  });

  it("collapses repeated separators", () => {
    assert.equal(sanitizeName("get", "//foo//bar//"), "get_foo_bar");
  });

  it("falls back to 'tool' for pathological input", () => {
    assert.equal(sanitizeName("", ""), "tool");
  });
});

describe("buildUrl", () => {
  it("appends query parameters", () => {
    const url = buildUrl(
      "https://api.example.com",
      "/v1/user/by/username",
      { username: "instagram" },
      [{ name: "username", in: "query", required: true }],
    );
    assert.equal(url, "https://api.example.com/v1/user/by/username?username=instagram");
  });

  it("substitutes path parameters", () => {
    const url = buildUrl(
      "https://api.example.com",
      "/v1/users/{id}",
      { id: 42 },
      [{ name: "id", in: "path", required: true }],
    );
    assert.equal(url, "https://api.example.com/v1/users/42");
  });

  it("encodes unsafe characters in query and path values", () => {
    const url = buildUrl(
      "https://api.example.com",
      "/users/{slug}",
      { slug: "hello world", q: "a&b" },
      [
        { name: "slug", in: "path" },
        { name: "q", in: "query" },
      ],
    );
    assert.equal(url, "https://api.example.com/users/hello%20world?q=a%26b");
  });

  it("repeats array values as query params", () => {
    const url = buildUrl(
      "https://api.example.com",
      "/search",
      { tag: ["a", "b"] },
      [{ name: "tag", in: "query" }],
    );
    assert.equal(url, "https://api.example.com/search?tag=a&tag=b");
  });

  it("omits undefined and null values", () => {
    const url = buildUrl(
      "https://api.example.com",
      "/search",
      { q: "x", cursor: undefined, limit: null },
      [
        { name: "q", in: "query" },
        { name: "cursor", in: "query" },
        { name: "limit", in: "query" },
      ],
    );
    assert.equal(url, "https://api.example.com/search?q=x");
  });
});

describe("shouldIncludeOperation", () => {
  const excluded = new Set(["Legacy"]);

  it("excludes deprecated operations", () => {
    assert.equal(
      shouldIncludeOperation({ deprecated: true, tags: ["A"] }, [], excluded),
      false,
    );
  });

  it("excludes operations tagged with a blacklisted tag", () => {
    assert.equal(shouldIncludeOperation({ tags: ["Legacy"] }, [], excluded), false);
  });

  it("includes operations when no whitelist is set", () => {
    assert.equal(shouldIncludeOperation({ tags: ["A"] }, [], excluded), true);
  });

  it("whitelist limits to matching tags", () => {
    assert.equal(shouldIncludeOperation({ tags: ["A"] }, ["B"], excluded), false);
    assert.equal(shouldIncludeOperation({ tags: ["A", "B"] }, ["B"], excluded), true);
  });
});

describe("mergeParameters", () => {
  const spec: OpenApiSpec = {
    paths: {},
    components: {
      parameters: {
        SharedCursor: { name: "cursor", in: "query", description: "shared cursor" },
      },
    },
  };

  it("resolves $ref parameters from components", () => {
    const resolved = resolveParameter({ $ref: "#/components/parameters/SharedCursor" }, spec);
    assert.ok(resolved);
    assert.equal(resolved.name, "cursor");
    assert.equal(resolved.in, "query");
  });

  it("returns null for unresolvable $ref", () => {
    const resolved = resolveParameter({ $ref: "#/components/parameters/Missing" }, spec);
    assert.equal(resolved, null);
  });

  it("merges path-level and operation-level parameters, op overrides", () => {
    const merged = mergeParameters(
      [
        { name: "page", in: "query", required: false },
        { name: "limit", in: "query", required: false },
      ],
      [
        { name: "page", in: "query", required: true },
      ],
      spec,
    );
    assert.equal(merged.length, 2);
    const page = merged.find((p) => p.name === "page")!;
    const limit = merged.find((p) => p.name === "limit")!;
    assert.equal(page.required, true, "op-level required overrides path-level");
    assert.equal(limit.required, false);
  });

  it("expands $ref params during merge", () => {
    const merged = mergeParameters(
      [{ $ref: "#/components/parameters/SharedCursor" }],
      [],
      spec,
    );
    assert.equal(merged.length, 1);
    assert.equal(merged[0].name, "cursor");
  });
});

describe("buildTools", () => {
  const spec: OpenApiSpec = {
    paths: {
      "/v2/user/by/username": {
        get: {
          summary: "Get user by username",
          tags: ["User Profile"],
          parameters: [{ name: "username", in: "query", required: true, schema: { type: "string" } }],
        },
      },
      "/v1/legacy": {
        get: { summary: "old", tags: ["Legacy"] },
      },
      "/v1/bad": {
        get: { summary: "deprecated", tags: ["User Profile"], deprecated: true },
      },
      "/v2/shared/{id}": {
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        get: {
          summary: "Shared path param endpoint",
          tags: ["User Profile"],
        },
      },
      "/v1/not-get": {
        post: { summary: "write", tags: ["User Profile"] },
      },
    },
  };

  it("creates one tool per non-deprecated GET, excluding blacklisted tags", () => {
    const tools = buildTools(spec, { excludeTags: new Set(["Legacy"]) });
    const names = tools.map((t) => t.tool.name).sort();
    assert.deepEqual(names, ["get_v2_shared_id", "get_v2_user_by_username"]);
  });

  it("inherits path-level parameters into the generated tool", () => {
    const tools = buildTools(spec, { excludeTags: new Set(["Legacy"]) });
    const shared = tools.find((t) => t.tool.name === "get_v2_shared_id")!;
    assert.equal(shared.parameters.length, 1);
    assert.equal(shared.parameters[0].name, "id");
    assert.equal(shared.parameters[0].in, "path");
    const req = (shared.tool.inputSchema as { required?: string[] }).required ?? [];
    assert.deepEqual(req, ["id"]);
  });

  it("respects whitelist via includeTags", () => {
    const tools = buildTools(spec, {
      includeTags: ["User Profile"],
      excludeTags: new Set(["Legacy"]),
    });
    assert.ok(tools.length > 0);
    assert.ok(tools.every((t) => t.tool.description.startsWith("[GET ")));
  });
});

describe("isTrustedUrl", () => {
  it("accepts api.hikerapi.com and the api.instagrapi.com alias", () => {
    assert.equal(isTrustedUrl("https://api.hikerapi.com"), true);
    assert.equal(isTrustedUrl("https://api.instagrapi.com/openapi.json"), true);
  });

  it("rejects unrelated hosts", () => {
    assert.equal(isTrustedUrl("https://evil.example.com"), false);
    assert.equal(isTrustedUrl("http://localhost:8080"), false);
  });

  it("rejects malformed URLs", () => {
    assert.equal(isTrustedUrl("not a url"), false);
  });
});
