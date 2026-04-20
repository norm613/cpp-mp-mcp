# CLAUDE.md — cpp-mp-mcp Development Guide

Instructions for a Claude Code session working on this repo (not for the MCP's runtime behavior — that's enforced by the tool surface itself).

## Ministry Platform Data Safety — MANDATORY

**Never create, update, or delete Ministry Platform records without explicit user confirmation first.** No agents. No scripts. No "cleanup" operations.

MP is a shared production database with real church member data — contacts, donations, communications, groups, events. Unauthorized writes can affect thousands of people.

If this repo ever grows write tools, every one of them must:
1. Stop before executing.
2. Show the user exactly what will be affected (table, record IDs, old → new values).
3. Wait for explicit per-operation confirmation.

Read-only tools (`mp-get-*`, `mp-list-*`, `mp-search-*`) are always fine.

## Architecture

Stdio MCP server. No bundling, no compile step — runs via `tsx` at invocation time. Dynamically imports MPHelper from the user's local MPNext checkout (`%USERPROFILE%\code\MPNext`) via `await import(pathToFileURL(...))`. Rationale: MPNext evolves upstream, and we want every `git pull` there to flow into this server automatically.

```
src/index.ts   All tool definitions + handlers in one file (small surface)
```

## Dependency Discipline

- `@modelcontextprotocol/sdk` — MCP transport + types
- `dotenv` — env loading from `MPNext/.env.local` with local `.env` fallback
- `zod` — input validation (optional; available if tool schemas need it)
- `tsx` / `typescript` — dev tooling

Do not add dependencies casually. The server is intentionally small and thin.

## Adding a New Tool

1. Define the tool's entry in the `ListToolsRequestSchema` handler (`src/index.ts`).
2. Add a `case` branch in the `CallToolRequestSchema` handler that calls the relevant MPHelper method.
3. Keep descriptions action-oriented so Claude picks the right tool naturally.
4. If the tool writes to MP, add a runtime safety gate that the caller must acknowledge (not yet implemented in v0.1 because no write tools exist).
5. Update README's tool table and CLAUDE.md safety section if writes are added.

## Testing

No automated tests in v0.1. Manual verification:
- `claude mcp list` shows `mp` as Connected.
- From inside a Claude Code session, invoke each tool at least once against the MP production tenant.
- Confirm error handling: pass a bogus table name, confirm the MP error is surfaced cleanly (not a stack trace).

## Upstream Coupling

This server expects MPHelper at:

```
<MPNEXT_PATH>/src/lib/providers/ministry-platform/index.ts
```

If the MPNext project restructures that path or changes MPHelper's constructor signature, this server breaks. When that happens, update `src/index.ts` to match.

MPHelper methods currently used:
- `getTableRecords(params)`
- `getTables(search?)`
- `getProcedures(search?)`
- `getDomainInfo()`
- `getGlobalFilters(tableName?)`

## Don't

- Don't commit `.env`, `.env.local`, or any file containing real credentials.
- Don't add tools that bypass MPHelper (raw `fetch`/curl to MP). The whole point of this MCP is that Claude's MP access routes through MPHelper's validation layer.
- Don't build a `dist/` folder or compiled output — the server runs via `tsx` at launch.
