# Datum Revit Agent Setup

This connects your local Revit plugin to cloud Copilot.

## 1) Prerequisites

- Revit plugin installed and running (`revit-mcp-plugin` service switched ON)
- Revit open on the same machine
- Plugin listening on `127.0.0.1:8080`

## 2) Pair from Copilot

1. Open `/copilot`
2. In **Revit Connection** panel, click **Generate Pair Code**
3. Keep the code visible

## 3) Start local agent

### Option A (recommended for users): `.exe`

Download and run `DatumRevitAgent.exe` on the Revit machine.

Behavior in latest agent build:

- Single-instance lock: launching it again will not create a second running terminal.
- Revit socket retry: keeps retrying `127.0.0.1:8080` and auto-recovers if plugin starts late.
- Config + token remain in `%APPDATA%\DatumRevitAgent\config.json`.

If using command line:

```powershell
.\DatumRevitAgent.exe --url https://your-datum-domain.com
```

Then enter the pairing code when prompted.

### Option B (developer mode): Node script

Run on the Revit machine:

```bash
DATUM_URL=https://your-datum-domain.com npm run revit-agent
```

Enter the pairing code when prompted.

Optional persistent token mode:

```bash
DATUM_URL=https://your-datum-domain.com REVIT_AGENT_TOKEN=<token> npm run revit-agent
```

For `.exe`, token/config is saved automatically at:

```text
%APPDATA%\DatumRevitAgent\config.json
```

## 4) Execute commands from chat

Use manual command mode:

```text
/run get_levels_list {}
```

```text
/run create_wall {"walls":[{"locationLine":{"startPoint":{"x":0,"y":0,"z":0},"endPoint":{"x":5000,"y":0,"z":0}},"baseLevelId":30,"unconnectedHeight":3000,"isStructural":false}]}
```

If agent is disconnected, command jobs timeout and return an error.
