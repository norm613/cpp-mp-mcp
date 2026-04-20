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
# 1. Make sure MPNext is at %USERPROFILE%\code\MPNext and has .env.local set up.
#    If not, clone and configure it first per MPNext's own docs.

# 2. Clone and install this server
mkdir $env:USERPROFILE\code -Force
cd $env:USERPROFILE\code
git clone https://github.com/norm613/cpp-mp-mcp.git
cd cpp-mp-mcp
npm install

# 3. Register with Claude Code at user scope (run from PowerShell, not Git Bash)
claude mcp add mp --scope user -- cmd /c npx tsx "$env:USERPROFILE\code\cpp-mp-mcp\src\index.ts"

# 4. Verify
claude mcp list
# 'mp' should show: ✓ Connected
```

Then relaunch Claude Code. Ask it "look up Contact 4173 in Ministry Platform" to confirm.

---

## Configuration

### Credentials come from MPNext

By default this server reads MP credentials from `%USERPROFILE%\code\MPNext\.env.local`. That's deliberate — keeping creds in one place (the MPNext install) means you configure them once, and both the MPNext CLI scripts and this MCP server use the same values.

If you keep MPNext elsewhere, override via the `MPNEXT_PATH` env var in the `claude mcp add` command:

```powershell
claude mcp add mp --scope user --env MPNEXT_PATH=D:\path\to\MPNext -- cmd /c npx tsx "$env:USERPROFILE\code\cpp-mp-mcp\src\index.ts"
```

### Local `.env` override

You can also drop a `.env` in this repo's root to override specific vars for this MCP only (e.g., point at the MP sandbox during testing). Values in local `.env` override values loaded from MPNext's `.env.local`.

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
