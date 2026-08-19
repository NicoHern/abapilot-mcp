#!/usr/bin/env node
/**
 * ABAPilot MCP Connector
 * ----------------------
 * Thin Model Context Protocol server that connects any MCP client
 * (Claude, Claude Code, Cursor, ChatGPT) to a licensed ABAPilot
 * backend running inside an SAP system (/ABAPILOT/ namespace).
 *
 * This connector contains no business logic. Each tool maps 1:1 to a
 * whitelisted endpoint of the ABAPilot dispatcher (SICF service). All
 * operations execute inside SAP, gated by the customer-controlled
 * endpoint whitelist, the calling user's SAP authorizations, and the
 * audit log in the customer's own system.
 *
 * Configuration (environment variables):
 *   ABAPILOT_URL       Base URL of the ABAPilot SICF service
 *                      e.g. http://sap-dev.example.com:8000/sap/bc/ZABAPilot
 *   ABAPILOT_USER      SAP user for the connection
 *   ABAPILOT_PASSWORD  SAP password (or use ABAPILOT_TOKEN)
 *   ABAPILOT_TOKEN     Bearer token, if your gateway issues one
 *   ABAPILOT_CLIENT    SAP client (Mandant), e.g. 100 (optional)
 *   ABAPILOT_TLS_INSECURE  Set to "1" to skip TLS verification (dev only)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
const VERSION = "1.0.3";
// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const cfg = {
    url: process.env.ABAPILOT_URL ?? "",
    user: process.env.ABAPILOT_USER ?? "",
    password: process.env.ABAPILOT_PASSWORD ?? "",
    token: process.env.ABAPILOT_TOKEN ?? "",
    client: process.env.ABAPILOT_CLIENT ?? "",
    tlsInsecure: process.env.ABAPILOT_TLS_INSECURE === "1",
};
const NOT_CONFIGURED = "ABAPilot connector is running without a backend: ABAPILOT_URL is not set. " +
    "Point it at your ABAPilot SICF service, e.g. " +
    "ABAPILOT_URL=http://<sap-host>:<port>/sap/bc/ZABAPilot " +
    "(plus ABAPILOT_USER/ABAPILOT_PASSWORD or ABAPILOT_TOKEN). " +
    "A licensed ABAPilot backend is required: https://crimsonconsultingsl.com/abapilot/";
if (!cfg.url) {
    // Keep running so MCP clients and registries can introspect the tool
    // catalog; every tool call returns setup instructions instead.
    console.error(NOT_CONFIGURED);
}
if (cfg.tlsInsecure) {
    // Development systems with self-signed certificates only.
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}
function endpointUrl(path) {
    const u = new URL(cfg.url);
    u.pathname = u.pathname.replace(/\/+$/, "") + path;
    if (cfg.client && !u.searchParams.has("sap-client")) {
        u.searchParams.set("sap-client", cfg.client);
    }
    return u.toString();
}
async function sapRequest(path, payload) {
    if (!cfg.url) {
        return { ok: false, error: NOT_CONFIGURED };
    }
    const headers = {
        "Content-Type": "application/json",
        "X-ABAPilot-Connector": `npm/${VERSION}`,
    };
    if (cfg.token) {
        headers["Authorization"] = `Bearer ${cfg.token}`;
    }
    else if (cfg.user) {
        headers["Authorization"] =
            "Basic " + Buffer.from(`${cfg.user}:${cfg.password}`).toString("base64");
    }
    const url = endpointUrl(path);
    let res;
    try {
        res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
        });
    }
    catch (e) {
        return {
            ok: false,
            error: `Cannot reach the ABAPilot endpoint at ${url} — ` +
                `check ABAPILOT_URL, network/VPN access to the SAP system, and that ` +
                `the SICF service is active. (${e.message})`,
        };
    }
    const text = await res.text();
    if (!res.ok) {
        return {
            ok: false,
            error: `SAP endpoint ${path} returned HTTP ${res.status}: ${text.slice(0, 500)}`,
        };
    }
    try {
        return { ok: true, data: JSON.parse(text) };
    }
    catch {
        // Endpoint returned non-JSON (plain text or ABAP-formatted output)
        return { ok: true, data: text };
    }
}
function toResult(r) {
    if (!r.ok) {
        return {
            isError: true,
            content: [{ type: "text", text: r.error ?? "Unknown error" }],
        };
    }
    const body = typeof r.data === "string" ? r.data : JSON.stringify(r.data, null, 2);
    return { content: [{ type: "text", text: body }] };
}
const up = (s) => (s ?? "").toUpperCase();
// ---------------------------------------------------------------------------
// MCP server and tools — each tool maps 1:1 to a whitelisted ABAPilot
// endpoint. The connecting AI supplies the reasoning (which table, which
// WHERE clause); SAP supplies the data, under the user's authorizations.
// ---------------------------------------------------------------------------
const server = new McpServer({
    name: "abapilot",
    version: VERSION,
});
const WHERE_HINT = "WHERE uses ABAP operators: EQ NE GE LE GT LT LIKE IN, values in single " +
    "quotes. Dates are YYYYMMDD. Numeric keys carry leading zeros " +
    "(vendor 1000 = LIFNR EQ '0000001000', material = 18 digits). " +
    "Example: \"MTART EQ 'FERT' AND ERSDA GE '20260101'\"";
server.tool("sap_read_table_data", "Query rows from an SAP table with optional WHERE filtering. Use " +
    "sap_search_tables / sap_read_table_structure first if unsure of the " +
    "table or field names. " + WHERE_HINT, {
    table_name: z.string().describe("SAP table name, e.g. LFA1, EKKO, MARA"),
    where_clause: z
        .string()
        .optional()
        .describe("ABAP-style WHERE condition (see tool description)"),
    max_rows: z.number().optional().describe("Maximum rows to return (default 100)"),
}, async ({ table_name, where_clause, max_rows }) => toResult(await sapRequest("/read_table_data", {
    table_name: up(table_name),
    where_clause: where_clause ?? "",
    max_rows: max_rows ?? 100,
    include_metadata: true,
})));
server.tool("sap_read_table_structure", "Get the field definitions of an SAP table or structure — names, types, " +
    "lengths, key fields, descriptions. Call this before querying a table " +
    "you are not sure about.", {
    table_name: z.string().describe("SAP table or structure name, e.g. EKKO"),
}, async ({ table_name }) => toResult(await sapRequest("/read_table_structure", { table_name: up(table_name) })));
server.tool("sap_search_tables", "Search the SAP Data Dictionary for tables by keyword, matching table " +
    "names and descriptions, e.g. 'vendor' finds LFA1/LFB1. Use this to " +
    "discover the right table before querying.", {
    keyword: z.string().describe("Search term, e.g. 'vendor', 'purchase'"),
    max_results: z.number().optional().describe("Maximum results (default 20)"),
}, async ({ keyword, max_results }) => toResult(await sapRequest("/search_tables", {
    keyword: up(keyword),
    max_results: max_results ?? 20,
})));
server.tool("sap_read_code", "Read ABAP source code from the connected system — programs, classes, " +
    "function groups, includes, interfaces.", {
    object_type: z
        .string()
        .describe("Object type: PROG, CLAS, FUGR, INCL or INTF"),
    object_name: z.string().describe("Object name, e.g. ZREPORT01, ZCL_MY_CLASS"),
}, async ({ object_type, object_name }) => toResult(await sapRequest("/read_code", {
    object_type: up(object_type),
    object_name: up(object_name),
})));
server.tool("sap_read_where_used", "Cross-reference lookup (like SE84): direction 'forward' answers 'what " +
    "programs/classes use this object?', direction 'inverse' answers 'what " +
    "does this program use?'.", {
    object_name: z.string().describe("Object name, e.g. MARA, ZCL_MY_CLASS"),
    object_type: z
        .string()
        .optional()
        .describe("TABL, VIEW, DTEL, DOMA, STRU, PROG, INCL, FUNC, CLAS or FUGR (default TABL)"),
    direction: z
        .string()
        .optional()
        .describe("'forward' (what uses X, default) or 'inverse' (what X uses)"),
    max_results: z.number().optional().describe("Maximum results (default 100)"),
}, async ({ object_name, object_type, direction, max_results }) => toResult(await sapRequest("/read_where_used", {
    object_name: up(object_name),
    object_type: up(object_type) || "TABL",
    direction: direction ?? "forward",
    max_results: max_results ?? 100,
})));
server.tool("sap_syntax_check", "Validate ABAP source code against the connected system's syntax rules " +
    "(release-accurate, e.g. ECC 6.0 restrictions) without saving anything.", {
    source: z.array(z.string()).describe("ABAP source code as an array of lines"),
    program_name: z
        .string()
        .optional()
        .describe("Optional program name for context"),
}, async ({ source, program_name }) => toResult(await sapRequest("/syntax_check", {
    source,
    program_name: up(program_name),
})));
server.tool("sap_read_dumps", "Read ST22 ABAP runtime errors (short dumps). Dates are YYYYMMDD; " +
    "defaults to today when no dates are given.", {
    date_from: z.string().optional().describe("Start date YYYYMMDD"),
    date_to: z.string().optional().describe("End date YYYYMMDD"),
    user: z.string().optional().describe("Filter by SAP user"),
    max_rows: z.number().optional().describe("Maximum rows (default 100)"),
}, async ({ date_from, date_to, user, max_rows }) => toResult(await sapRequest("/read_dumps", {
    date_from: date_from ?? "",
    date_to: date_to ?? "",
    user: up(user),
    max_rows: max_rows ?? 100,
})));
server.tool("sap_read_jobs", "Read SM37 background jobs — status, runtime, scheduling. Status codes: " +
    "F=Finished, A=Aborted, R=Running, S=Scheduled, P=Ready. Dates YYYYMMDD.", {
    date_from: z.string().optional().describe("Start date YYYYMMDD (default last 7 days)"),
    date_to: z.string().optional().describe("End date YYYYMMDD"),
    user: z.string().optional().describe("Filter by scheduling user"),
    status: z.string().optional().describe("F, A, R, S or P"),
    job_name: z.string().optional().describe("Job name prefix filter"),
    max_rows: z.number().optional().describe("Maximum rows (default 100)"),
}, async ({ date_from, date_to, user, status, job_name, max_rows }) => toResult(await sapRequest("/read_jobs", {
    date_from: date_from ?? "",
    date_to: date_to ?? "",
    user: up(user),
    status: up(status),
    job_name: up(job_name),
    max_rows: max_rows ?? 100,
})));
// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`ABAPilot MCP connector ${VERSION} connected — backend: ${cfg.url || "(not configured)"}`);
