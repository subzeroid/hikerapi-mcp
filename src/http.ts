export interface FetchResult {
  ok: boolean;
  status: number;
  statusText: string;
  text: string;
  truncated: boolean;
}

export class FetchError extends Error {
  constructor(message: string, readonly kind: "timeout" | "network" | "too-large") {
    super(message);
    this.name = "FetchError";
  }
}

export async function fetchWithLimit(
  url: string,
  init: RequestInit,
  maxBytes: number,
  timeoutMs: number,
): Promise<FetchResult> {
  const signal = AbortSignal.timeout(timeoutMs);
  // Disable connection reuse: some upstream HTTP servers close keep-alive
  // sockets aggressively and undici's pool reuses a dead socket on the next
  // request, hanging until the AbortSignal fires.
  const headers = new Headers(init.headers);
  headers.set("connection", "close");
  let resp: Response;
  try {
    resp = await fetch(url, { ...init, signal, headers });
  } catch (err) {
    if (isAbortError(err)) {
      throw new FetchError(`Request timed out after ${timeoutMs}ms`, "timeout");
    }
    throw new FetchError(
      `Network error: ${err instanceof Error ? err.message : String(err)}`,
      "network",
    );
  }

  const body = resp.body;
  if (!body) {
    return { ok: resp.ok, status: resp.status, statusText: resp.statusText, text: "", truncated: false };
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        truncated = true;
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
  } catch (err) {
    if (isAbortError(err)) {
      throw new FetchError(`Response read timed out after ${timeoutMs}ms`, "timeout");
    }
    throw new FetchError(
      `Network error during read: ${err instanceof Error ? err.message : String(err)}`,
      "network",
    );
  }

  if (truncated) {
    throw new FetchError(
      `Response exceeded size limit (${maxBytes} bytes)`,
      "too-large",
    );
  }

  const merged = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  const text = new TextDecoder("utf-8").decode(merged);

  return { ok: resp.ok, status: resp.status, statusText: resp.statusText, text, truncated: false };
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
}
