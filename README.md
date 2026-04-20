# hikerapi-mcp

[![npm version](https://img.shields.io/npm/v/hikerapi-mcp.svg)](https://www.npmjs.com/package/hikerapi-mcp)
[![npm downloads](https://img.shields.io/npm/dm/hikerapi-mcp.svg)](https://www.npmjs.com/package/hikerapi-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

MCP server for [HikerAPI](https://hikerapi.com) — Instagram data API. Available on npm: [`hikerapi-mcp`](https://www.npmjs.com/package/hikerapi-mcp).

Auto-generates MCP tools from the HikerAPI OpenAPI spec at startup, so every non-deprecated `GET` endpoint is exposed without hand-written wrappers. HikerAPI only exposes read (`GET`) endpoints — the server maps each one 1:1 to an MCP tool (`GET /v2/user/by/username` → `get_v2_user_by_username`).

## Get 100 Free API Requests

**[Sign up with this link](https://hikerapi.com/p/hsazcgym)** and get **100 free HikerAPI requests** — no credit card required. Enough to wire up the MCP server, try a few prompts in Claude/Cursor/Codex, and evaluate the data quality before committing.

> **[Get your free 100 requests here](https://hikerapi.com/p/hsazcgym)**

## Quick start

1. Get an API key at [hikerapi.com/tokens](https://hikerapi.com/tokens).
2. Add the server to your AI assistant.
3. Ask your assistant something like:
   - *"Get the Instagram profile for @nasa."*
   - *"Find the top 5 recent posts under the hashtag `#photography`."*
   - *"Show stories for the user with id 25025320."*

### Claude Code

```bash
claude mcp add hikerapi -e HIKERAPI_KEY=your-api-key -- npx -y hikerapi-mcp
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "hikerapi": {
      "command": "npx",
      "args": ["-y", "hikerapi-mcp"],
      "env": {
        "HIKERAPI_KEY": "your-api-key"
      }
    }
  }
}
```

### Cursor / Windsurf

Same shape as Claude Desktop — put the block under `mcpServers` in the app's MCP config file.

### Zed

Add to `~/.config/zed/settings.json`:

```json
{
  "context_servers": {
    "hikerapi": {
      "command": "npx",
      "args": ["-y", "hikerapi-mcp"],
      "env": {
        "HIKERAPI_KEY": "your-api-key"
      }
    }
  }
}
```

### OpenAI Codex

Append to `~/.codex/config.toml`:

```toml
[mcp_servers.hikerapi]
command = "npx"
args = ["-y", "hikerapi-mcp"]

[mcp_servers.hikerapi.env]
HIKERAPI_KEY = "your-api-key"
```

## Tools

Tools are generated at startup from the live [HikerAPI OpenAPI spec](https://api.hikerapi.com/openapi.json), so the list always matches the current API. Roughly **100+ tools** across these groups (sizes as of this writing):

| Group          | Tools | Examples                                                         |
| -------------- | ----- | ---------------------------------------------------------------- |
| User Profile   | 36    | `get_v2_user_by_username`, `get_v2_user_by_id`, `get_v1_user_medias` |
| Post Details   | 20    | `get_v2_media_info_by_code`, `get_v2_media_comments`, `get_v2_media_likers` |
| Search         | 13    | `get_v1_search_users`, `get_v1_search_hashtags`                  |
| Hashtags       | 7     | `get_v2_hashtag_medias_top`, `get_v2_hashtag_medias_recent`      |
| Stories        | 7     | `get_v2_story_by_url`, `get_v1_story_by_id`                      |
| Location       | 7     | `get_v1_location_medias_recent`, `get_v1_location_search`        |
| Audio, Share, Highlights, Comments | ~10 | `get_v2_track_by_id`, `get_v1_share_by_url`, …     |

Each tool name mirrors its endpoint (`GET /v2/user/by/username` → `get_v2_user_by_username`). Your assistant can call `tools/list` over MCP to get the full, up-to-date list with parameter schemas. `Legacy` and `System` groups are excluded by default.

## Configuration

| Variable                      | Description                                                                            | Required |
| ----------------------------- | -------------------------------------------------------------------------------------- | -------- |
| `HIKERAPI_KEY`                | Your HikerAPI access key (sent as `x-access-key` header)                               | yes      |
| `HIKERAPI_URL`                | Base URL. Default: `https://api.hikerapi.com` (alias `https://api.instagrapi.com`)     | no       |
| `HIKERAPI_SPEC_URL`           | OpenAPI spec URL. Default: `${HIKERAPI_URL}/openapi.json`                              | no       |
| `HIKERAPI_TAGS`               | Whitelist: only include operations with these tags (comma-separated)                   | no       |
| `HIKERAPI_EXCLUDE_TAGS`       | Blacklist: additional tags to exclude (on top of default `Legacy`,`System`)            | no       |
| `HIKERAPI_TIMEOUT_MS`         | Per-request timeout for API calls. Default: `30000`                                    | no       |
| `HIKERAPI_SPEC_TIMEOUT_MS`    | Timeout for the startup spec fetch. Default: `60000`                                   | no       |
| `HIKERAPI_MAX_RESPONSE_BYTES` | Max bytes read from each API response. Default: `10485760` (10 MB)                     | no       |
| `HIKERAPI_MAX_SPEC_BYTES`     | Max bytes read from the OpenAPI spec. Default: `8388608` (8 MB)                        | no       |

`Legacy` and `System` tags are excluded by default. Deprecated operations are also skipped.

If `HIKERAPI_URL` points to a host other than `api.hikerapi.com` or `api.instagrapi.com`, the server prints a warning on startup — your key will be sent there, so only use it for a self-hosted or proxied HikerAPI.

Example — expose only the most common groups:

```json
"env": {
  "HIKERAPI_KEY": "...",
  "HIKERAPI_TAGS": "User Profile,Post Details,Search,Hashtags,Stories"
}
```

## How it works

```
AI Assistant ←stdio→ hikerapi-mcp ──https──> api.hikerapi.com
                          │
                          └─ fetches /openapi.json once on startup,
                             builds one MCP tool per GET endpoint
```

Tool arguments map to the endpoint's `query` and `path` parameters. The response body is returned as-is (JSON text). Non-2xx responses are surfaced as tool errors with the HTTP status and body.

## Development

```bash
git clone https://github.com/subzeroid/hikerapi-mcp.git
cd hikerapi-mcp
npm install
npm run build
HIKERAPI_KEY=your-key node dist/index.js
```

Run in watch mode:

```bash
HIKERAPI_KEY=your-key npm run dev
```

Run tests (unit + stdio smoke tests against a local mock server, no network/API key required):

```bash
npm test
```

## License

MIT
