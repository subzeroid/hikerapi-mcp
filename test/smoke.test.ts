import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ENTRY = join(ROOT, "src", "index.ts");

const SPEC = {
  openapi: "3.1.0",
  info: { title: "mock", version: "0" },
  components: {
    parameters: {
      Cursor: { name: "cursor", in: "query", schema: { type: "string" } },
    },
  },
  paths: {
    "/v2/user/by/username": {
      get: {
        summary: "Get user by username",
        tags: ["User Profile"],
        parameters: [
          { name: "username", in: "query", required: true, schema: { type: "string" } },
          { $ref: "#/components/parameters/Cursor" },
        ],
      },
    },
    "/v1/legacy": {
      get: { summary: "old", tags: ["Legacy"] },
    },
    "/v1/system": {
      get: { summary: "system", tags: ["System"] },
    },
  },
};

interface HttpCall {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
}

interface MockRouteFn {
  (req: IncomingMessage, res: ServerResponse): void;
}

let mockServer: Server;
let baseUrl = "";
const calls: HttpCall[] = [];
let apiHandler: MockRouteFn = (req, res) => {
  res.statusCode = 404;
  res.end("no handler");
};

before(async () => {
  mockServer = createServer((req, res) => {
    const path = req.url ?? "/";
    calls.push({ method: req.method ?? "", url: path, headers: { ...req.headers } });

    if (path === "/openapi.json") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(SPEC));
      return;
    }
    apiHandler(req, res);
  });

  mockServer.listen(0, "127.0.0.1");
  await once(mockServer, "listening");
  const addr = mockServer.address();
  if (!addr || typeof addr !== "object") throw new Error("no address");
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  mockServer.close();
  await once(mockServer, "close");
});

describe("hikerapi-mcp server (smoke)", () => {
  it("lists tools and forwards calls with x-access-key header", async () => {
    apiHandler = (req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, path: req.url, key: req.headers["x-access-key"] }));
    };

    const client = await spawnServer({
      HIKERAPI_KEY: "test-key",
      HIKERAPI_URL: baseUrl,
    });

    try {
      const init = await client.request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "smoke", version: "0" },
      });
      assert.equal((init as { serverInfo: { name: string } }).serverInfo.name, "hikerapi-mcp");
      client.notify("notifications/initialized", {});

      const list = (await client.request("tools/list", {})) as { tools: Array<{ name: string }> };
      const names = list.tools.map((t) => t.name);
      assert.ok(
        names.includes("get_v2_user_by_username"),
        `expected get_v2_user_by_username in ${names.join(",")}`,
      );
      assert.ok(!names.includes("get_v1_legacy"), "Legacy tag should be excluded by default");
      assert.ok(!names.includes("get_v1_system"), "System tag should be excluded by default");

      const result = (await client.request("tools/call", {
        name: "get_v2_user_by_username",
        arguments: { username: "instagram" },
      })) as { content: Array<{ type: string; text: string }>; isError?: boolean };

      assert.ok(!result.isError, `unexpected error: ${JSON.stringify(result)}`);
      const payload = JSON.parse(result.content[0].text);
      assert.equal(payload.ok, true);
      assert.equal(payload.key, "test-key");
      assert.equal(payload.path, "/v2/user/by/username?username=instagram");
    } finally {
      await client.close();
    }
  });

  it("surfaces upstream HTTP errors as tool errors", async () => {
    apiHandler = (_req, res) => {
      res.statusCode = 403;
      res.setHeader("content-type", "application/json");
      res.end('{"detail":"forbidden"}');
    };

    const client = await spawnServer({
      HIKERAPI_KEY: "test-key",
      HIKERAPI_URL: baseUrl,
    });

    try {
      await client.request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "smoke", version: "0" },
      });
      client.notify("notifications/initialized", {});

      const result = (await client.request("tools/call", {
        name: "get_v2_user_by_username",
        arguments: { username: "instagram" },
      })) as { content: Array<{ text: string }>; isError?: boolean };

      assert.equal(result.isError, true);
      assert.match(result.content[0].text, /HTTP 403/);
      assert.match(result.content[0].text, /forbidden/);
    } finally {
      await client.close();
    }
  });
});

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
        const msg = JSON.parse(line) as { id?: number; result?: unknown; error?: { message: string } };
        if (typeof msg.id === "number" && pending.has(msg.id)) {
          const { resolve, reject } = pending.get(msg.id)!;
          pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      } catch {
        /* ignore non-JSON stderr leakage */
      }
    }
  });

  child.stderr.setEncoding("utf-8");
  let stderrBuf = "";
  child.stderr.on("data", (chunk: string) => {
    stderrBuf += chunk;
  });

  await waitForStderr(() => stderrBuf.includes("Loaded ") && stderrBuf.includes("tools"), 10_000);

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

  async function waitForStderr(predicate: () => boolean, timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(`Server did not become ready in ${timeoutMs}ms. stderr:\n${stderrBuf}`);
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}
