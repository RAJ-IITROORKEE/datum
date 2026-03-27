# Cloud Relay Architecture (Revit + MCP + Copilot)

This document describes the new cloud relay implementation that allows a cloud-hosted MCP server to communicate with a local Revit plugin over WebSocket, even behind NAT/firewalls.

## Why this was added

The old approach depended on a local desktop agent polling database jobs. That works for some setups, but for commercial deployments it creates friction and reliability issues.

The relay approach solves this by:

- Keeping all browser/LLM logic in cloud
- Letting Revit initiate an outbound WebSocket connection
- Avoiding inbound local network requirements
- Supporting real-time command routing between MCP and Revit

## High-level architecture

```text
Datumm Copilot (Browser)
        |
        v
Datum Next.js (Vercel)
  - /api/revit/relay/token
  - /api/revit/relay/status
        |
        v
Revit MCP Server (Railway, single port)
  - HTTP /mcp
  - HTTP /api/relay/token
  - HTTP /api/relay/token/:token
  - WS   /relay
        |
        v
Revit Plugin (local machine)
  - Cloud Relay settings page
  - Connects outbound to wss://.../relay
```

## Deployment model (single-port)

Railway typically exposes one public port per service.

To support this, the MCP and relay run in the same process and same public domain:

- MCP HTTP endpoints share host with relay
- Relay WebSocket is mounted at path `/relay`
- Pairing token APIs are under `/api/relay/*`

## Server implementation details

Repository: `D:\Web development\MCP\revit-mcp`

Key files:

- `src/server-combined.ts`
  - Runs MCP + relay on one HTTP server
  - Exposes `/health`, `/status`, `/mcp`, `/api/relay/token`, `/api/relay/token/:token`
  - Attaches relay WS at `/relay`

- `src/relay/relay-server.ts`
  - WebSocket hub for `revit` and `mcp` clients
  - Pairing token management (8-char tokens, expiry)
  - Message routing and ping/pong health

- `src/relay/index.ts`
  - Exports relay server/client APIs

- `package.json`
  - `start` uses `build/server-combined.js`

## Token and pairing model

1. Copilot requests token via Datum API route
2. Datum API calls MCP endpoint `POST /api/relay/token` with MCP API key
3. Server returns:
   - `token` (8 chars)
   - `expiresAt`
   - `websocketUrl` (e.g. `wss://revit-mcp-datum-production.up.railway.app/relay`)
4. User enters token + relay URL in Revit plugin settings
5. Plugin connects to relay and sends `register` with token
6. Relay marks token linked; MCP commands can now route to that Revit session

## Datum (Next.js) integration

Repository: `D:\Web development\PROJECTS-FULL STACK\Datum`

### API routes

- `app/api/revit/relay/token/route.ts`
  - Authenticates user via Clerk
  - Calls MCP: `POST {MCP_SERVER_URL}/api/relay/token`
  - Returns `{ token, expiresAt, relayUrl }` to UI

- `app/api/revit/relay/status/route.ts`
  - Authenticates user via Clerk
  - Calls MCP: `GET {MCP_SERVER_URL}/api/relay/token/:token`
  - Returns token validity and connection state (`revitConnected`, `mcpConnected`)

### Copilot UI

- `components/copilot/revit-connection-menu.tsx`
  - Adds **Cloud Relay (Revit Plugin)** section
  - `Generate relay token`
  - `Copy URL + token`
  - Shows relay URL/token/expiry
  - Polls relay status and shows plugin connection state

## Revit plugin integration

Repository: `D:\Web development\MCP\revit-mcp-plugin`

Key files:

- `Core/RelayService.cs`
  - WebSocket client implementation
  - Connect/disconnect, register, receive commands, send responses

- `Configuration/RelaySettings.cs`
  - Stores relay URL/token/autoconnect in local JSON

- `UI/RelaySettingsPage.xaml` + `.xaml.cs`
  - Cloud Relay settings UI in plugin
  - Connect button and status display

- `UI/SettingsWindow.xaml` + `.cs`
  - Adds Cloud Relay tab to settings navigation

### Correct plugin values

- Relay URL: `wss://revit-mcp-datum-production.up.railway.app/relay`
- Pairing Token: 8-char token generated from Copilot menu

Important: do **not** use `wss://https://...` (invalid URL format).

## Environment variables

### Vercel (Datum)

- `MCP_SERVER_URL=https://revit-mcp-datum-production.up.railway.app`
- `MCP_API_KEY=<your-railway-mcp-api-key>`

### Railway (revit-mcp)

- `MCP_API_KEY=<same-key-used-by-datum>`
- `PORT` is provided by Railway

## Runtime flow (end-to-end)

1. User opens `/copilot`
2. Opens Revit menu and generates relay token
3. Copilot gets token from Datum API (`/api/revit/relay/token`)
4. Datum forwards to Railway MCP (`/api/relay/token`)
5. User pastes token + relay URL in Revit plugin
6. Plugin connects to `wss://.../relay` and registers with token
7. Copilot checks token status (`/api/revit/relay/status`) and sees plugin connected
8. MCP tool calls route through relay to local Revit

## Health checks

- MCP health: `GET https://revit-mcp-datum-production.up.railway.app/health`
- MCP status (auth): `GET /status`
- Create token (auth): `POST /api/relay/token`
- Token state (auth): `GET /api/relay/token/:token`

## Backward compatibility

The local DB-polling Revit Agent flow remains available.

Copilot now supports both modes:

- Local Agent pairing (existing)
- Cloud Relay pairing (new)

## Troubleshooting

- **Relay token generated but plugin never connects**
  - Verify URL exactly: `wss://revit-mcp-datum-production.up.railway.app/relay`
  - Verify token is 8 chars and not expired
  - Check plugin status text after connect

- **Unauthorized from relay APIs**
  - Ensure Datum has correct `MCP_API_KEY`
  - Ensure Railway `MCP_API_KEY` matches

- **404 on relay endpoint**
  - Confirm Railway runs combined server build (`server-combined`)
  - Confirm endpoint path is `/api/relay/token` (not legacy `/token`)

- **Copilot menu missing relay controls**
  - Ensure latest deploy includes `components/copilot/revit-connection-menu.tsx` updates
