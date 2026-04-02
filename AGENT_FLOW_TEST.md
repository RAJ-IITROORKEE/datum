# Agent Execution Flow Test

## Overview
This document traces the complete flow of agent execution from frontend to backend and back.

## Test Scenario
**User Request:** "Create a simple 10x10 meter room with walls"

---

## Flow Breakdown

### 1. Frontend: User Submits Message
**File:** `components/copilot/chat-interface.tsx`

**Function:** `handleSubmit` (line 745)

**Steps:**
1. Create user message object
2. Add to messages state
3. Clear input
4. Set loading state
5. Reset agent events
6. Create abort controller

---

### 2. Frontend: Pre-flight Check
**File:** `components/copilot/chat-interface.tsx`

**Function:** `performPreflightCheck` (line 246)

**Steps:**
1. Check if request matches build pattern (line 763-764):
   - Keywords: create, build, make, add, place, design, construct, generate
   - Object keywords: wall, floor, room, door, window, house, layout, bhk, bedroom

2. If build request detected:
   - Emit pre-flight event with "checking" status
   - Fetch `/api/copilot/mcp` endpoint
   - Verify:
     - MCP server connected
     - Revit connected (relay or legacy)
     - Tools available (toolCount > 0)

3. Results:
   - **Pass:** Emit success insight, proceed to execution
   - **Fail:** Emit error insight, stop execution, show error message

---

### 3. Frontend: Send Request to Backend
**File:** `components/copilot/chat-interface.tsx`

**Steps:**
1. Prepare messages array with conversation history
2. POST to `/api/copilot/chat`:
   ```json
   {
     "messages": [...],
     "model": "anthropic/claude-sonnet-4.5",
     "conversationId": "..."
   }
   ```
3. Setup SSE stream reader
4. Start streaming assistant response

---

### 4. Backend: Authentication & Setup
**File:** `app/api/copilot/chat/route.ts`

**Function:** `POST` (line 1175)

**Steps:**
1. Authenticate with Clerk (line 1176)
2. Parse request body (line 1185)
3. Fetch/create conversation in database (line 1190-1222)
4. Save user message to database (line 1225)
5. Check connections:
   - MCP server status
   - Relay token validity
   - Legacy agent heartbeat
   - Tool availability

---

### 5. Backend: Determine Execution Mode
**File:** `app/api/copilot/chat/route.ts`

**Decision Points:**
1. Check if status intent → Return connection status
2. Check if manual `/run` command → Execute single tool
3. Check if requires agentic mode (line 1493):
   - Complex multi-step requests
   - Build/create keywords with BIM objects
   - Continuation of previous workflow

4. Route selection:
   - **New Agent System** (if `USE_NEW_AGENT_SYSTEM=true`) → line 2228
   - **Legacy Agentic System** (default) → line 2365
   - **Simple LLM Response** → line 2762

---

### 6. Backend: Legacy Agentic Execution (Default)
**File:** `app/api/copilot/chat/route.ts`

**Phase 1: Planning** (line 2365-2447)
1. Emit "Planning Started" insight
2. Call `generateAgenticPlan()` with:
   - User text
   - Available tools list
   - Conversation context
3. Analyze plan response:
   - **Needs clarification** → Ask user for more info
   - **No executable steps** → Inform user
   - **Valid plan** → Proceed to execution

**Phase 2: Execution Loop** (line 2454-2698)

For each step in plan:
1. Update step status to "in_progress"
2. Emit progress event
3. Resolve tool name (handle aliases)
4. Normalize arguments (e.g., create_wall)
5. Execute via `executeRevitToolForUser()`:
   - **Try MCP first** (Cloud Relay)
   - **Fallback to legacy** (if allowed)
6. Check result:
   - **Success:**
     - Mark step as "completed"
     - Emit success insight
     - Ask LLM if should continue
   - **Failure:**
     - Mark step as "failed"
     - Emit error insight with reason
     - Ask LLM whether to stop or adapt

**Phase 3: Final Summary** (line 2700-2729)
1. Count successful/failed steps
2. Emit final execution insight:
   - **All successful** → Success insight
   - **Some failed** → Warning insight
3. Send final response text
4. Save to database
5. Close SSE stream

---

### 7. Backend: Tool Execution
**File:** `app/api/copilot/chat/route.ts`

**Function:** `executeRevitToolForUser` (line 179)

**MCP Path (Preferred):**
1. Fetch user's relay token from database
2. Call `mcpClient.callTool(toolName, args, relayToken)`
3. Check for tool errors in result
4. Return `{ success: true, result, transport: "mcp" }`

**Legacy Path (Fallback):**
1. Call `enqueueCommandForUser()` → Creates job in database
2. Call `waitForCommandResult(jobId)` → Polls for completion
3. Return result with transport: "legacy"

---

### 8. Frontend: Process SSE Events
**File:** `components/copilot/chat-interface.tsx`

**Function:** `processStreamLine` (line 658)

**Event Types:**
- `{ content: "..." }` → Append to assistant message
- `{ conversationId: "..." }` → Save conversation ID
- `{ agent: {...} }` → Add to agent events array

**Agent Event Structure:**
```typescript
{
  stage: "planning" | "executing" | "completed" | "error" | "preflight",
  message: string,
  kind: "analysis" | "tool" | "plan" | "preflight" | "insight" | "summary",
  toolName?: string,
  details?: string,
  plan?: Array<{...}>,
  insight?: {
    type: "success" | "warning" | "error" | "info",
    title: string,
    description?: string
  },
  timestamp: string
}
```

---

### 9. Frontend: Render Agent Progress UI
**File:** `components/copilot/chat-interface.tsx`

**UI Components Rendered:**

1. **Pre-flight Status** (line 1050):
   - Shield icon with checking/passed/failed state

2. **Insight Cards** (line 1068-1074):
   - Show last 3 insights prominently
   - Color-coded by type (success/warning/error/info)
   - Icon + title + description

3. **Execution Summary** (line 1077-1079):
   - Shows completed/failed/pending counts
   - Color-coded based on status

4. **Failed Steps Summary** (line 1082):
   - Collapsible red-styled section
   - Lists all failed steps with reasons

5. **Execution Plan** (line 1085-1136):
   - Collapsible section (expanded by default)
   - Shows all steps with status icons
   - Progress badge (e.g., "3/5")

6. **Tool Activity Log** (line 1139-1203):
   - Collapsible section (collapsed by default)
   - Detailed tool execution events
   - Code/JSON details in nested accordions

---

## Success Criteria

✅ **Pre-flight check passes** before execution
✅ **Plan generated** with 1+ valid steps
✅ **Tools execute** successfully via MCP or legacy
✅ **Insights displayed** for each step (success/error)
✅ **Summary shown** at the end
✅ **Failed steps** highlighted if any
✅ **No crashes** or unhandled errors
✅ **Database saved** (conversation, messages)

---

## Common Failure Points

### ❌ Pre-flight Fails
**Cause:** Revit not connected, no relay token, MCP server down
**Result:** Execution stops, error message shown
**Fix:** Ensure Revit plugin connected via Cloud Relay

### ❌ Tool Execution Fails
**Cause:** Invalid arguments, Revit error, network timeout
**Result:** Step marked as failed, error insight shown
**LLM Decision:** May stop or try alternative approach

### ❌ Connection Lost During Execution
**Cause:** MCP server disconnected, relay token expired
**Result:** Tool calls fail, fallback to legacy may work
**UI:** Shows connection lost warning

### ❌ Plan Generation Fails
**Cause:** LLM doesn't understand request, no matching tools
**Result:** Asks for clarification or informs user
**Fix:** User provides more specific details

---

## Test Verification Steps

1. **Start Revit** with Datum plugin
2. **Connect Cloud Relay** via UI
3. **Send test message:** "Create a simple 10x10 meter room"
4. **Verify:**
   - Pre-flight check shows "passed"
   - Plan appears with 4-6 steps
   - Steps execute one by one
   - Success insights appear
   - Final summary shows "X/X completed"
   - Assistant message describes what was created

---

## Environment Variables

- `USE_NEW_AGENT_SYSTEM` - Toggle between new/legacy agent (default: false)
- `OPENROUTER_API_KEY` - LLM API key
- Database connection for Prisma
- MCP server URL (from getMCPClient)

---

## Next Steps

- [ ] Manual test with real Revit connection
- [ ] Add retry mechanism for transient failures
- [ ] Improve error messages for common issues
- [ ] Add connection recovery during execution
- [ ] Consider enabling new agent system
