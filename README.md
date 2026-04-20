# cpp-mp-mcp

MCP server that gives Claude Code access to Ministry Platform via the **MPHelper** library from the community [MPNext](https://github.com/MinistryPlatform-Community/MPNext) project. Built for Catholic Parishes in Partnership (CPP) staff.

This server enforces that all Claude-driven MP access flows through MPHelper's validation layer — there is no direct REST API tool. Claude can query Contacts, Donations, Groups, Events, Communications, and any other MP table, but only through MPHelper's typed, validated methods.

---

## How This Differs From Other MCPs

- **Shared instance credentials.** The MP OAuth client ID/secret is the same for every CPP user. One key, one tenant.
- **Live dependency on MPNext.** This server does not vendor MPHelper. Instead, it imports MPHelper from your local MPNext checkout at runtime. When you `git pull` MPNext, the next server launch uses the updated code. No rebuild of this repo needed.
- **Read-focused initial tool surface.** Contact lookup, table queries, discovery. Writes are intentionally absent from v0.1 — if you need to create/update/delete MP data, work with Fr. Norman to add gated write tools in a future version.

---

## Prerequisites

- [ ] **Windows 10/11 with PowerShell**
- [ ] **Node.js LTS** — `node --version` should work. Install: `winget install OpenJS.NodeJS.LTS` (then reopen PowerShell)
- [ ] **Git** — `git --version` should work. Install: `winget install Git.Git`
- [ ] **Claude Code CLI** — signed in to claude.ai
- [ ] **MPNext installed at the canonical path** — `%USERPROFILE%\code\MPNext` with its `.env.local` configured. See MPNext's own README for setup. This server reads MP credentials from `MPNext\.env.local`.

---

## Quick Start

```powershell
# 1. Make sure MPNext is at %USERPROFILE%\code\MPNext with .env.local configured
#    for PRODUCTION (your MP tenant's prod URL, client ID, and client secret).

# 2. Clone and install this server
mkdir $env:USERPROFILE\code -Force
cd $env:USERPROFILE\code
git clone https://github.com/norm613/cpp-mp-mcp.git
cd cpp-mp-mcp
npm install

# 3. Register for PRODUCTION (uses MPNext's .env.local as-is)
claude mcp add mp --scope user -- cmd /c npx tsx "$env:USERPROFILE\code\cpp-mp-mcp\src\index.ts"

# 4. Verify
claude mcp list
# 'mp' should show: ✓ Connected
```

Then relaunch Claude Code. Ask it "look up Contact 4173 in Ministry Platform" to confirm.

## Managing Both Production and Sandbox

MP has separate prod and sandbox tenants. This server supports ONE tenant per process (MPHelper is a singleton internally), so to connect to both, **register the MCP twice in Claude Code** with different env vars per registration. They show up in Claude as two distinct tools, and you pick which one for each query.

### Production registration
Uses credentials from MPNext's `.env.local`:
```powershell
claude mcp add mp --scope user -- cmd /c npx tsx "$env:USERPROFILE\code\cpp-mp-mcp\src\index.ts"
```

### Sandbox registration
Pass sandbox credentials explicitly — they override anything in `.env.local`:
```powershell
claude mcp add mp-sandbox --scope user `
  --env MINISTRY_PLATFORM_BASE_URL=https://mpsandbox.archomaha.org/ministryplatformapi `
  --env MINISTRY_PLATFORM_CLIENT_ID=MPNext `
  --env MINISTRY_PLATFORM_CLIENT_SECRET=YOUR_SANDBOX_SECRET `
  -- cmd /c npx tsx "$env:USERPROFILE\code\cpp-mp-mcp\src\index.ts"
```

Substitute `YOUR_SANDBOX_SECRET` with your actual sandbox client secret (ask your MP admin if you don't have it). The base URL and client ID can also be overridden from prod if your sandbox uses different values.

### After both are registered
`claude mcp list` will show:
```
mp           ✓ Connected   (production tenant)
mp-sandbox   ✓ Connected   (sandbox tenant)
```

In Claude Code sessions, tools appear with distinct prefixes — `mcp__mp__*` for production and `mcp__mp_sandbox__*` for sandbox. When asking Claude to do something, be explicit about which tenant: *"look this up in MP sandbox"* vs *"look this up in MP production."*

**Rule of thumb:** test writes in sandbox first, promote to production only after review. See the safety section below.

---

## Configuration

### Environment variables (what MPHelper reads)

The MCP passes these through to MPHelper:

| Variable | Purpose |
|----------|---------|
| `MINISTRY_PLATFORM_BASE_URL` | MP REST API base URL (e.g., `https://mp.archomaha.org/ministryplatformapi`) |
| `MINISTRY_PLATFORM_CLIENT_ID` | OAuth client ID (e.g., `MPNext`) |
| `MINISTRY_PLATFORM_CLIENT_SECRET` | OAuth client secret |

**Resolution order** (first wins):
1. `--env` flags passed to `claude mcp add`
2. Variables already in your shell environment
3. A local `.env` in this repo
4. `.env.local` in your MPNext install

For the default prod registration, source 4 (MPNext's `.env.local`) provides everything. For sandbox, source 1 (`--env` flags) overrides only what's different.

### Custom MPNext path

If MPNext lives somewhere other than `%USERPROFILE%\code\MPNext`, pass `MPNEXT_PATH`:

```powershell
claude mcp add mp --scope user --env MPNEXT_PATH=D:\path\to\MPNext -- cmd /c npx tsx "$env:USERPROFILE\code\cpp-mp-mcp\src\index.ts"
```

---

## Available Tools

### Read tools (all available by default)

| Tool | Purpose |
|------|---------|
| `mp-get-table-records` | Query any MP table with OData `$Filter`, `$Select`, `$OrderBy`. The workhorse. |
| `mp-get-contact` | Look up a single Contact by `Contact_ID`. |
| `mp-search-contacts` | Search Contacts by name, email, or phone (partial matches). |
| `mp-list-tables` | Discover what tables exist in MP. |
| `mp-list-procedures` | Discover callable stored procedures. |
| `mp-get-domain-info` | Report MP instance metadata — good for sanity-checking which tenant you're connected to. |
| `mp-list-global-filters` | List saved filter definitions on a table. |

### Write tools

**Intentionally not exposed in v0.1.** MP Production is read-only for Claude by default (per the shared Data Safety rule). If you genuinely need write access through Claude, work with Fr. Norman to add the specific write tools you need with appropriate confirmation gates.

---

## Data Safety Rules (MANDATORY)

Ministry Platform is a production database with real church member data — contacts, donations, communications, groups, events. Unauthorized writes can affect thousands of people.

**Read-only by design in v0.1.** The tools above are all SELECT operations. There's no create/update/delete surface exposed.

**If writes are ever added:** Claude must never create, update, or delete records without your explicit, per-operation confirmation. Show the user exactly what will change (table, fields, old → new values) and wait for an explicit "yes."

See the upstream MPNext project's `CLAUDE.md` for the full MP safety doctrine — this server inherits those rules.

---

## Troubleshooting

### `claude mcp list` shows `mp` as "Failed to connect"

Run the raw command by hand to see the real error:

```powershell
cmd /c npx tsx "$env:USERPROFILE\code\cpp-mp-mcp\src\index.ts"
```

Common causes:
- **Node.js not installed or PATH not refreshed** — `winget install OpenJS.NodeJS.LTS`, reopen PowerShell
- **`npm install` not run** in `cpp-mp-mcp` — `cd "$env:USERPROFILE\code\cpp-mp-mcp"; npm install`
- **MPNext not at the canonical path** — clone MPNext to `%USERPROFILE%\code\MPNext` or set `MPNEXT_PATH`
- **MPNext's `.env.local` missing creds** — open `%USERPROFILE%\code\MPNext\.env.local` and confirm `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, and `MP_BASE_URL` are populated
- **Wrong credentials** — you'll see an OAuth 400/401 from MP when the server starts; regenerate creds in MP and update `.env.local`

### Server starts but queries fail with 400 Bad Request

Common causes:
- Invalid `$Filter` syntax — MP uses SQL-style quoting (`First_Name = 'John'`, not `= "John"`)
- Table name typo — use `mp-list-tables` to discover valid names
- Trying to combine `$Filter` and `$Search` — pick one

### Need to pick up MPNext updates

```powershell
cd $env:USERPROFILE\code\MPNext
git pull
```

That's it. No rebuild of this server needed — it imports MPHelper live from your updated MPNext checkout.

---

## Architecture

```
Claude Code
  → MCP stdio transport
    → cpp-mp-mcp/src/index.ts (this server)
      → MPHelper (imported live from %USERPROFILE%\code\MPNext)
        → MP REST API (api.archomaha.org)
```

**Why dynamic import?** Static TypeScript imports require a compile-time path. To keep MPHelper current as MPNext evolves upstream — without us re-vendoring files — we load it at runtime via `import(pathToFileURL(...))`. This lets every MPNext `git pull` flow through automatically.

---

## For Claude Sessions Working on This Repo

See [`CLAUDE.md`](CLAUDE.md).

---

## License

Private — all rights reserved. See [`LICENSE`](LICENSE).

This repository is published publicly so authorized CPP staff can clone and install it without needing a GitHub account. The code itself is not open-source. No license is granted to copy, modify, or redistribute.
