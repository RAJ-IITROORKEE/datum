# Datum Revit Copilot - End-to-End Testing Guide

## Overview

This guide explains how to test the complete agentic Revit copilot system with cloud relay routing.

## System Architecture

```
Browser UI → Next.js API (Vercel) → MCP Server (Railway) → WebSocket Relay → Revit Plugin
```

## Prerequisites

1. **Environment Variables** (`.env.local`):
   ```env
   USE_NEW_AGENT_SYSTEM=true
   MCP_SERVER_URL=https://revit-mcp-datum-production.up.railway.app
   MCP_API_KEY=c8e331f621c4e46b0be5c9d815a171a261ad2dacff7324cf737bb42442b0094d
   DATABASE_URL=<your_database_url>
   ```

2. **Running Services**:
   - Database (PostgreSQL)
   - MCP Server on Railway
   - Local Next.js dev server (`npm run dev`)
   - Revit with Plugin installed

## Testing Workflow

### 1. Generate Relay Token

1. Navigate to `/copilot` in browser
2. Click "Revit Connection" button in header
3. Click "Generate Cloud Token"
4. **Copy the token** - you'll need this for the Revit plugin

**Expected Result**: 
- Token appears in UI
- Token persisted to database (`RevitRelayToken` table)
- Connection badge shows "Connecting..."

### 2. Connect Revit Plugin

In the Revit Plugin console/settings:

```bash
# Plugin should connect to:
wss://revit-mcp-datum-production.up.railway.app/relay

# With the token from step 1
X-Relay-Token: <your-generated-token>
```

**Expected Result**:
- Plugin establishes WebSocket connection
- Connection badge turns **green** and shows "Cloud Ready (X tools)"
- Tool count reflects available Revit MCP tools

### 3. Test Agent Execution

Send a test command in the copilot chat:

**Simple Test**:
```
Create a wall in Revit
```

**Advanced Test**:
```
Get the list of all levels in the project, then create a floor at level 1
```

**Expected Behavior**:

1. **Planning Phase** (Purple badges):
   - Agent analyzes request
   - "Execution plan" shows steps with `pending` status
   - Analysis trace shows reasoning (collapsible)

2. **Executing Phase** (Blue badges with animation):
   - Steps change to `in_progress` one at a time
   - Tool activity shows each MCP tool call
   - Badges show tool names (e.g., `create_wall`)
   - Animated dots indicate active execution

3. **Completion Phase** (Green badges):
   - Completed steps show green checkmarks
   - Tool activity shows success messages
   - Final response summarizes what was done

4. **Error Handling** (Red badges):
   - Failed steps show red X icons
   - Error details appear in tool activity
   - Agent may retry or explain failure

## UI Status Indicators

### Connection Badge

| State | Badge | Meaning |
|-------|-------|---------|
| 🟢 Green | "Cloud Ready (X tools)" | Relay connected via cloud |
| 🟢 Green | "Ready (X tools)" | Legacy agent connected |
| 🟡 Yellow | "Revit Offline" | MCP connected but no Revit |
| 🔴 Red | "Connection Lost" | Lost during execution |
| ⚪ Gray | "Connecting..." | Initial connection |

### Agent Status Badges

| Color | Status | Icon | Meaning |
|-------|--------|------|---------|
| 🟣 Purple | PLANNING | 🧠 Brain | Agent analyzing request |
| 🔵 Blue | EXECUTING | ⏳ Loader | Tool running (animated) |
| 🟢 Green | COMPLETED | ✓ CheckCircle | Step succeeded |
| 🔴 Red | FAILED | ⚠ AlertCircle | Step/tool failed |
| 🟡 Yellow | BLOCKED | ⚠ AlertCircle | Waiting for dependency |
| ⚪ Gray | PENDING | ○ Dot | Not started yet |

## Common Issues

### Token Not Persisting

**Symptom**: Connection badge shows "Connecting..." after page refresh

**Cause**: Token not saved to database

**Check**:
```sql
SELECT * FROM "RevitRelayToken" WHERE "clerkUserId" = '<your-user-id>';
```

**Fix**: Verify database connection and Prisma schema is migrated

### Tools Not Routing to Revit

**Symptom**: Agent calls tools but nothing happens in Revit

**Root Cause**: MCP client not passing relay token

**Verify**:
1. Check MCP server logs for `X-Relay-Token` header
2. Verify token matches what's in database
3. Check Revit plugin WebSocket connection status

**Debug**:
```typescript
// In lib/agent/executor.ts
console.log('Using relay token:', relayToken); // Should NOT be null
```

### Connection Lost During Execution

**Symptom**: Red "Connection Lost" banner appears

**Causes**:
- Revit crashed
- Plugin WebSocket disconnected
- Network issue
- Token expired (30-day TTL)

**Recovery**:
1. Click "Retry" button
2. Generate new token if expired
3. Reconnect Revit plugin

## Verification Checklist

- [ ] Relay token generates successfully
- [ ] Token persists after browser refresh
- [ ] Connection badge shows green when plugin connects
- [ ] Tool count displays correct number
- [ ] Agent creates execution plan
- [ ] Plan steps update status in real-time
- [ ] Tool activity shows each MCP call
- [ ] Colored badges reflect correct states
- [ ] Animated indicators work during execution
- [ ] Tools actually execute in Revit
- [ ] Error states display correctly
- [ ] Stop button aborts execution
- [ ] Message queuing works during execution

## Testing Scenarios

### Scenario 1: Simple Tool Call
**Input**: `/run get_levels_list {}`

**Expected**:
- Single-step plan
- Blue "EXECUTING" badge
- Tool activity shows `get_levels_list`
- Green "COMPLETED" badge
- JSON response in chat

### Scenario 2: Multi-Step Task
**Input**: `Create 3 walls at different levels`

**Expected**:
- Multi-step plan (e.g., get levels → create wall × 3)
- Steps execute sequentially
- Each tool call logged
- Progress updates in real-time

### Scenario 3: Error Handling
**Input**: `Create a wall with invalid parameters`

**Expected**:
- Red "FAILED" badge on error step
- Error details in tool activity
- Agent explains what went wrong
- May suggest correction

### Scenario 4: Connection Loss
**Action**: Disconnect Revit plugin mid-execution

**Expected**:
- Red "Connection Lost" banner
- Execution halts
- Error logged in tool activity
- Retry button available

## Performance Benchmarks

- Token generation: < 500ms
- Relay connection: < 2s
- Simple tool call: < 3s
- Multi-step plan (3 steps): < 10s
- UI status updates: Real-time (< 100ms)

## Next Steps After Testing

1. ✅ Verify all phases completed successfully
2. ✅ Commit testing documentation
3. ✅ Push changes to GitHub
4. 🚀 Deploy to production (Vercel)
5. 📊 Monitor production metrics
6. 🐛 Collect user feedback for improvements

## Rollback Plan

If critical issues found:

1. Set `USE_NEW_AGENT_SYSTEM=false` in environment
2. System falls back to legacy agent architecture
3. Investigate and fix issues
4. Re-enable feature flag when ready
