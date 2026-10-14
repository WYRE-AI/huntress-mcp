# Huntress MCP Server

[![Build Status](https://github.com/WYRE-AI/huntress-mcp/actions/workflows/release.yml/badge.svg)](https://github.com/WYRE-AI/huntress-mcp/actions/workflows/release.yml)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that provides AI assistants with structured access to [Huntress](https://www.huntress.com) cybersecurity platform data and operations.

> **Note:** This project is maintained by [Wyre Technology](https://github.com/WYRE-AI).

## Quick Start

**Claude Desktop** — download, open, done:

1. Download `huntress-mcp.mcpb` from the [latest release](https://github.com/WYRE-AI/huntress-mcp/releases/latest)
2. Open the file (double-click or drag into Claude Desktop)
3. Enter your Huntress credentials when prompted (API Key, API Secret)

No terminal, no JSON editing, no Node.js install required.

**Claude Code (CLI):**

```bash
claude mcp add huntress-mcp \
  -e HUNTRESS_API_KEY=your-api-key \
  -e HUNTRESS_API_SECRET=your-api-secret \
  -- npx -y github:WYRE-AI/huntress-mcp
```

See [Installation](#installation) for Docker and from-source methods.

## Features

- **🔌 MCP Protocol Compliance**: Full support for MCP resources and tools
- **🛡️ Comprehensive Security Coverage**: Tools spanning agents, organizations, incidents, escalations, billing, signals, and users
- **🔍 Decision-Tree Navigation**: Start with `huntress_navigate` to explore domains, then dynamically load domain-specific tools
- **📝 CRUD Operations**: Create, read, update, delete operations for organizations, memberships, incidents, and more
- **🔒 Secure Authentication**: HTTP Basic Auth with Huntress API credentials
- **🌐 Dual Transport**: Supports both stdio (local) and HTTP Streamable (remote/Docker) transports
- **📦 MCPB Packaging**: One-click installation via MCP Bundle for desktop clients
- **🐳 Docker Ready**: Containerized deployment with HTTP transport and health checks
- **⚡ Rate Limiting**: Built-in rate limiter respects Huntress API limits (60 req/min)
- **📊 Structured Logging**: Comprehensive logging with configurable levels

## Table of Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Domains](#domains)
- [Docker Deployment](#docker-deployment)
- [Development](#development)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

## Installation

### Option 1: MCPB Bundle (Claude Desktop)

The simplest method — no terminal, no JSON editing, no Node.js install required.

1. Download `huntress-mcp.mcpb` from the [latest release](https://github.com/WYRE-AI/huntress-mcp/releases/latest)
2. Open the file (double-click or drag into Claude Desktop)
3. Enter your Huntress credentials when prompted (API Key, API Secret)

For **Claude Code (CLI)**, one command:

```bash
claude mcp add huntress-mcp \
  -e HUNTRESS_API_KEY=your-api-key \
  -e HUNTRESS_API_SECRET=your-api-secret \
  -- npx -y github:WYRE-AI/huntress-mcp
```

### Option 2: Docker

The image listens on `0.0.0.0` inside the container and defaults to `AUTH_MODE=gateway`. Publish the port on loopback and pass the service-to-service secret. In gateway mode, Huntress credentials arrive on each request as headers; they are not read from the environment.

```bash
docker run -d \
  -e CONDUIT_S2S_SECRET="$CONDUIT_S2S_SECRET" \
  -p 127.0.0.1:8080:8080 \
  ghcr.io/wyre-ai/huntress-mcp:latest
```

Compose refuses to start when `CONDUIT_S2S_SECRET` is unset:

```bash
CONDUIT_S2S_SECRET="$CONDUIT_S2S_SECRET" docker compose up
```

### Option 3: From Source

```bash
git clone https://github.com/WYRE-AI/huntress-mcp.git
cd huntress-mcp
npm ci
npm run build
```

## Configuration

Copy [`.env.example`](.env.example) and set the variables below.

| Variable | Required | Description |
|----------|----------|-------------|
| `HUNTRESS_API_KEY` | For stdio and `AUTH_MODE=env` | Huntress API public key |
| `HUNTRESS_API_SECRET` | For stdio and `AUTH_MODE=env` | Huntress API secret |
| `MCP_TRANSPORT` | No | `stdio` (default) or `http` |
| `AUTH_MODE` | No | `gateway` (Docker image and Compose default) or `env`. Gateway mode requires `X-Huntress-Api-Key` and `X-Huntress-Api-Secret` on each `/mcp` request and never falls back to `HUNTRESS_*`. `env` uses those variables only after S2S auth succeeds. |
| `CONDUIT_S2S_SECRET` | Yes for HTTP | Service-to-service secret. The HTTP server logs an error and exits non-zero when this is empty or a known placeholder (`changeme`, `secret`, `replace-me`, `your-s2s-secret`, and the other example values). Compose will not start without it. Never commit a real value. Generate one with `openssl rand -hex 32`. |
| `MCP_ALLOW_INSECURE_DEV` | No | Set to exactly `1` only for local development to start HTTP without `CONDUIT_S2S_SECRET`. The process logs a warning, does not enforce `X-Gateway-S2S`, and listens on `127.0.0.1` only. A non-loopback `MCP_HTTP_HOST` (including `0.0.0.0`) is ignored and the override is logged. A known placeholder secret is still refused. |
| `MCP_HTTP_HOST` | No | Bind address when `CONDUIT_S2S_SECRET` is set. Defaults to `127.0.0.1` when unset. The container image sets `0.0.0.0`. |
| `MCP_HTTP_PORT` | No | HTTP port. Defaults to `8080`. |
| `LOG_LEVEL` | No | Log level (`debug`, `info`, `warn`, `error`). Defaults to `info`. |

`/health` and `/healthz` stay unauthenticated and do not read credentials. The stdio transport does not use `CONDUIT_S2S_SECRET`.

### HTTP authentication

With `MCP_TRANSPORT=http` and `CONDUIT_S2S_SECRET` set, every `/mcp` request must include `X-Gateway-S2S`:

```
t=<unix seconds>,v1=<hex hmac-sha256>
```

`v1` is HMAC-SHA256 over the exact message `t=<unix seconds>`, keyed with `CONDUIT_S2S_SECRET`, hex-encoded. The timestamp must be within 300 seconds of the server clock. A missing or invalid header returns 401. The secret is never written to logs.

```javascript
import { createHmac } from 'node:crypto';

const t = Math.floor(Date.now() / 1000);
const v1 = createHmac('sha256', process.env.CONDUIT_S2S_SECRET).update(`t=${t}`).digest('hex');
const xGatewayS2s = `t=${t},v1=${v1}`;
```

In `AUTH_MODE=gateway`, `/mcp` also requires `X-Huntress-Api-Key` and `X-Huntress-Api-Secret`. Those headers are the only credential source for that request. A request missing either header returns 401 and does not fall back to `HUNTRESS_API_KEY` / `HUNTRESS_API_SECRET`.

```javascript
await fetch('http://127.0.0.1:8080/mcp', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'x-gateway-s2s': xGatewayS2s,
    'x-huntress-api-key': apiKey,
    'x-huntress-api-secret': apiSecret,
  },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
});
```

## Domains

The server uses decision-tree navigation. Start with `huntress_navigate` to pick a domain:

| Domain | Tools |
|--------|-------|
| **accounts** | Get account info, get current actor |
| **agents** | List agents, get agent by ID |
| **organizations** | List, get, create, update, delete organizations |
| **incidents** | Incident reports (list/get/resolve), remediations (list/get/approve/reject), escalations (list/get/resolve) |
| **billing** | Billing reports, summary reports |
| **signals** | List/get security signals |
| **users** | Membership CRUD (list/get/create/update/delete) |

## Docker Deployment

See [docker-compose.yml](docker-compose.yml) for full configuration. The checked-in Compose service is gateway mode. It does not set `HUNTRESS_API_KEY` or `HUNTRESS_API_SECRET` and does not use `env_file`, so a project `.env` cannot inject static vendor credentials into the container. Compose still interpolates `CONDUIT_S2S_SECRET` from that file and will not start when it is unset. The port is published on `127.0.0.1`.

```bash
cp .env.example .env
# Set CONDUIT_S2S_SECRET. Leave it empty in the example; never commit a real value.
CONDUIT_S2S_SECRET="$CONDUIT_S2S_SECRET" docker compose up -d
```

Single-tenant HTTP (`AUTH_MODE=env`) still requires the S2S secret, then uses `HUNTRESS_API_KEY` and `HUNTRESS_API_SECRET`. It is separate from the gateway Compose service:

```bash
docker run -d \
  -e CONDUIT_S2S_SECRET="$CONDUIT_S2S_SECRET" \
  -e AUTH_MODE=env \
  -e HUNTRESS_API_KEY=your-key \
  -e HUNTRESS_API_SECRET=your-secret \
  -p 127.0.0.1:8080:8080 \
  ghcr.io/wyre-ai/huntress-mcp:latest
```

Local HTTP without a secret is development-only. It binds `127.0.0.1` only and logs a warning:

```bash
MCP_TRANSPORT=http MCP_ALLOW_INSECURE_DEV=1 npm run start:http
```

## Development

```bash
npm ci
npm run build       # Build the project
npm run dev         # Watch mode
npm run test        # Run tests
npm run lint        # Type-check
npm run clean       # Remove dist/

# HTTP refuses to start until CONDUIT_S2S_SECRET is set
CONDUIT_S2S_SECRET="$CONDUIT_S2S_SECRET" npm run start:http

# Local HTTP only, without a service-to-service secret (always binds 127.0.0.1)
MCP_ALLOW_INSECURE_DEV=1 npm run start:http
```

## Testing

```bash
npm test            # Run test suite
npm run test:watch  # Watch mode
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

Apache 2.0 — Copyright WYRE Technology
