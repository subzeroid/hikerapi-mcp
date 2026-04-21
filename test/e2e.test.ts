import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ENTRY = join(ROOT, "src", "index.ts");

const KEY = process.env.HIKERAPI_KEY;

describe(
  "hikerapi-mcp e2e (real API)",
  { skip: !KEY ? "HIKERAPI_KEY not set — skipping e2e" : false },
  () => {
    let client: TestClient;

    before(async () => {
      client = await spawnServer({ HIKERAPI_KEY: KEY! });
      await client.request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "e2e", version: "0" },
      });
      client.notify("notifications/initialized", {});
    });

    after(async () => {
      await client?.close();
    });

    it("lists a reasonable number of tools from the live OpenAPI spec", async () => {
      const res = (await client.request("tools/list", {})) as {
        tools: Array<{ name: string }>;
      };
      assert.ok(
        res.tools.length >= 50,
        `expected >= 50 tools, got ${res.tools.length}`,
      );
      assert.ok(
        res.tools.some((t) => t.name === "get_v2_user_by_username"),
        "expected get_v2_user_by_username in tool list",
      );
    });

    it("fetches a real Instagram profile by username", async () => {
      const res = (await client.request("tools/call", {
        name: "get_v2_user_by_username",
        arguments: { username: "instagram" },
      })) as { content: Array<{ text: string }>; isError?: boolean };

      assert.ok(
        !res.isError,
        `tool call errored: ${res.content?.[0]?.text?.slice(0, 200)}`,
      );
      const text = res.content[0].text;
      assert.ok(text.length > 500, `response too small: ${text.length} bytes`);
      const payload = JSON.parse(text);
      const user = payload.user ?? payload;
      assert.equal(user.username, "instagram");
      assert.ok(user.pk || user.id, "expected user.pk or user.id in response");
    });
  },
);

interface TestClient {
  request(method: string, params: unknown): Promise<unknown>;
  notify(method: string, params: unknown): void;
  close(): Promise<void>;
}

async function spawnServer(env: Record<string, string>): Promise<TestClient> {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", ENTRY],
    {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    },
  ) as ChildProcessWithoutNullStreams;

  let buffer = "";
  let nextId = 1;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  child.stdout.setEncoding("utf-8");
  child.stdout.on("data", (chunk: string) => {
    buffer += chunk;
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as {
          id?: number;
          result?: unknown;
          error?: { message: string };
        };
        if (typeof msg.id === "number" && pending.has(msg.id)) {
          const { resolve, reject } = pending.get(msg.id)!;
          pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      } catch {
        /* ignore */
      }
    }
  });

  child.stderr.setEncoding("utf-8");
  let stderrBuf = "";
  child.stderr.on("data", (chunk: string) => {
    stderrBuf += chunk;
  });

  await waitForStderr(() => stderrBuf.includes("Loaded ") && stderrBuf.includes("tools"), 30_000);

  function send(obj: unknown): void {
    child.stdin.write(JSON.stringify(obj) + "\n");
  }

  return {
    request(method, params) {
      const id = nextId++;
      const p = new Promise<unknown>((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
      send({ jsonrpc: "2.0", id, method, params });
      return p;
    },
    notify(method, params) {
      send({ jsonrpc: "2.0", method, params });
    },
    async close() {
      child.stdin.end();
      child.kill("SIGTERM");
      await once(child, "exit");
    },
  };

  async function waitForStderr(
    predicate: () => boolean,
    timeoutMs: number,
  ): Promise<void> {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(
          `Server did not become ready in ${timeoutMs}ms. stderr:\n${stderrBuf}`,
        );
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}
