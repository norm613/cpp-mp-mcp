#!/usr/bin/env node
/**
 * cpp-mp-mcp — MCP server exposing Ministry Platform access to Claude Code
 * via MPHelper. Imports MPHelper from the local MPNext install (canonical
 * path: %USERPROFILE%\code\MPNext) so updates to MPNext flow through without
 * re-building this server.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as path from "path";
import { pathToFileURL } from "url";
import * as dotenv from "dotenv";

// --- Locate MPNext ---
const homeDir = process.env.USERPROFILE || process.env.HOME || "";
const mpnextPath =
  process.env.MPNEXT_PATH || path.join(homeDir, "code", "MPNext");

// Load MP credentials. MPNext's .env.local is the shared source of truth;
// fall back to this MCP's own .env if MPNext's isn't found.
const mpnextEnvPath = path.join(mpnextPath, ".env.local");
dotenv.config({ path: mpnextEnvPath });
dotenv.config(); // local .env overrides nothing already set

// --- Dynamically import MPHelper from MPNext's source ---
const mphelperEntry = path.join(
  mpnextPath,
  "src",
  "lib",
  "providers",
  "ministry-platform",
  "index.ts"
);
const { MPHelper } = (await import(
  pathToFileURL(mphelperEntry).href
)) as { MPHelper: new () => MPHelperInstance };

interface GetTableRecordsParams {
  table: string;
  filter?: string;
  select?: string;
  orderBy?: string;
  top?: number;
  skip?: number;
}
interface MPHelperInstance {
  getTableRecords<T = unknown>(params: GetTableRecordsParams): Promise<T[]>;
  getTables(search?: string): Promise<unknown[]>;
  getProcedures(search?: string): Promise<unknown[]>;
  getDomainInfo(): Promise<unknown>;
  getGlobalFilters(tableName?: string): Promise<unknown[]>;
}

const mp = new MPHelper();

// --- MCP server ---
const server = new Server(
  { name: "cpp-mp-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "mp-get-table-records",
      description:
        "Query any Ministry Platform table via MPHelper. Use this for read access to Contacts, Donations, Groups, Events, Communications, etc. Supports OData-style $Filter and $Select. Example: { table: 'Contacts', filter: 'Last_Name = \\'Stuhr\\'', select: 'Contact_ID, Display_Name, Email_Address', top: 10 }.",
      inputSchema: {
        type: "object",
        properties: {
          table: {
            type: "string",
            description: "MP table name, e.g. 'Contacts', 'Donations', 'Groups'",
          },
          filter: {
            type: "string",
            description:
              "OData $Filter expression (optional). Examples: 'Contact_ID = 4173', \"Last_Name = 'Norman'\", 'Donation_Date >= GETDATE() - 30'",
          },
          select: {
            type: "string",
            description:
              "Comma-separated column list (optional). If omitted, returns all columns.",
          },
          orderBy: {
            type: "string",
            description:
              "OData $OrderBy expression (optional), e.g. 'Last_Name ASC'",
          },
          top: {
            type: "number",
            description: "Max rows to return (default 25, max 500)",
            default: 25,
          },
          skip: {
            type: "number",
            description: "Rows to skip for pagination (optional)",
          },
        },
        required: ["table"],
      },
    },
    {
      name: "mp-get-contact",
      description:
        "Look up a single Contact by Contact_ID. Convenience wrapper around mp-get-table-records for the most common MP query. Returns the full contact record.",
      inputSchema: {
        type: "object",
        properties: {
          contactId: {
            type: "number",
            description: "MP Contact_ID (integer)",
          },
          select: {
            type: "string",
            description:
              "Comma-separated column list (optional). Default returns common identity + contact fields.",
          },
        },
        required: ["contactId"],
      },
    },
    {
      name: "mp-search-contacts",
      description:
        "Search Contacts by name, email, or phone. Builds a reasonable $Filter internally. Use mp-get-table-records for more complex queries.",
      inputSchema: {
        type: "object",
        properties: {
          firstName: { type: "string", description: "First name (partial match)" },
          lastName: { type: "string", description: "Last name (partial match)" },
          email: { type: "string", description: "Email address (partial match)" },
          phone: { type: "string", description: "Phone number (partial match)" },
          top: { type: "number", description: "Max rows (default 25)", default: 25 },
        },
      },
    },
    {
      name: "mp-list-tables",
      description:
        "List all MP tables visible to this OAuth client. Use for discovery when you don't know the exact table name.",
      inputSchema: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Optional substring filter on table name",
          },
        },
      },
    },
    {
      name: "mp-list-procedures",
      description:
        "List stored procedures callable via the REST API. For read-only discovery; do not execute procedures without explicit user confirmation (they may mutate data).",
      inputSchema: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Optional substring filter on procedure name",
          },
        },
      },
    },
    {
      name: "mp-get-domain-info",
      description:
        "Return MP instance metadata: domain name, version, configured timezone, etc. Useful for sanity-checking which tenant you're connected to.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "mp-list-global-filters",
      description:
        "List globally defined filters (saved filter definitions) on a table. These are the filter objects users can apply in the MP web UI.",
      inputSchema: {
        type: "object",
        properties: {
          tableName: {
            type: "string",
            description: "Optional: scope to a single table's filters",
          },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: rawArgs } = req.params;
  const args = (rawArgs ?? {}) as Record<string, unknown>;

  try {
    switch (name) {
      case "mp-get-table-records": {
        const result = await mp.getTableRecords({
          table: args.table as string,
          filter: args.filter as string | undefined,
          select: args.select as string | undefined,
          orderBy: args.orderBy as string | undefined,
          top: (args.top as number | undefined) ?? 25,
          skip: args.skip as number | undefined,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "mp-get-contact": {
        const defaultSelect =
          "Contact_ID, Display_Name, Nickname, First_Name, Last_Name, Email_Address, Mobile_Phone, Home_Phone, Company_Name, Contact_Status_ID, Household_ID, Date_of_Birth";
        const result = await mp.getTableRecords({
          table: "Contacts",
          filter: `Contact_ID = ${args.contactId}`,
          select: (args.select as string | undefined) ?? defaultSelect,
          top: 1,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "mp-search-contacts": {
        const clauses: string[] = [];
        if (args.firstName)
          clauses.push(`First_Name LIKE '%${escapeLike(args.firstName)}%'`);
        if (args.lastName)
          clauses.push(`Last_Name LIKE '%${escapeLike(args.lastName)}%'`);
        if (args.email)
          clauses.push(`Email_Address LIKE '%${escapeLike(args.email)}%'`);
        if (args.phone)
          clauses.push(
            `(Mobile_Phone LIKE '%${escapeLike(args.phone)}%' OR Home_Phone LIKE '%${escapeLike(args.phone)}%')`
          );

        if (clauses.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "Error: provide at least one of firstName, lastName, email, phone.",
              },
            ],
            isError: true,
          };
        }

        const result = await mp.getTableRecords({
          table: "Contacts",
          filter: clauses.join(" AND "),
          select:
            "Contact_ID, Display_Name, Nickname, First_Name, Last_Name, Email_Address, Mobile_Phone, Home_Phone, Household_ID",
          top: (args.top as number | undefined) ?? 25,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "mp-list-tables": {
        const result = await mp.getTables(args.search as string | undefined);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "mp-list-procedures": {
        const result = await mp.getProcedures(args.search as string | undefined);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "mp-get-domain-info": {
        const result = await mp.getDomainInfo();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "mp-list-global-filters": {
        const result = await mp.getGlobalFilters(
          args.tableName as string | undefined
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `MP error: ${message}` }],
      isError: true,
    };
  }
});

function escapeLike(value: unknown): string {
  return String(value).replace(/'/g, "''");
}

// --- Start server ---
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[cpp-mp-mcp] Connected via stdio (MPNext at " + mpnextPath + ")");
