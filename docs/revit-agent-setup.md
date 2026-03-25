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

Run on the Revit machine:

```bash
DATUM_URL=https://your-datum-domain.com npm run revit-agent
```

Enter the pairing code when prompted.

Optional persistent token mode:

```bash
DATUM_URL=https://your-datum-domain.com REVIT_AGENT_TOKEN=<token> npm run revit-agent
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
