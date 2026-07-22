# ABAPilot — AI & MCP Server for SAP ECC and On-Premise S/4HANA

ABAPilot is an in-system AI platform for SAP: natural-language business queries and AI-assisted ABAP development on the systems you already run — SAP ECC 6.0 through on-premise S/4HANA (any ABAP-based SAP instance). No BTP, no ADT, no RISE prerequisites. Deploys in ~2 hours.

**Website:** https://crimsonconsultingsl.com/abapilot/

**Architecture deep-dive:** [ARCHITECTURE.md](ARCHITECTURE.md)

**2026 guide — AI for SAP ECC:** https://crimsonconsultingsl.com/ai-for-sap-ecc/

**vs SAP's ABAP MCP Server:** https://crimsonconsultingsl.com/abapilot-vs-sap-abap-mcp-server/

## How it works

- **Inside SAP:** pure-ABAP add-on delivered as a transport into the registered `/ABAPILOT/` namespace, attached to a single SICF (ICF) node. No kernel changes, no Gateway, no BTP, no ADT/Eclipse dependency.
- **On your network:** an MCP server (local process or Docker) that connects any MCP client — Claude, Claude Code, Cursor, ChatGPT — to the SAP-side endpoints.
- **Your model:** BYOK for Claude, OpenAI, Gemini, Amazon Bedrock — or fully local via Ollama for zero-data-retention deployments.

## Quick start

```bash
npx -y abapilot
```

The free [npm connector](https://www.npmjs.com/package/abapilot) links any MCP client to the ABAPilot backend in your SAP system. Add it to e.g. Claude Desktop:

```json
{
  "mcpServers": {
    "abapilot": {
      "command": "npx",
      "args": ["-y", "abapilot"],
      "env": {
        "ABAPILOT_URL": "http://<sap-host>:<port>/sap/bc/ZABAPilot",
        "ABAPILOT_USER": "<sap-user>",
        "ABAPILOT_PASSWORD": "<sap-password>",
        "ABAPILOT_CLIENT": "100"
      }
    }
  }
}
```

## Tools

Each tool maps 1:1 to a whitelisted endpoint of the ABAPilot dispatcher in your SAP system. The AI client supplies the reasoning; SAP supplies the data, always under the connecting user's own authorizations.

- `sap_read_table_data` — query SAP table rows with ABAP-style WHERE filtering
- `sap_read_table_structure` — field definitions, types and keys of a table
- `sap_search_tables` — find tables in the Data Dictionary by keyword
- `sap_read_code` — read ABAP source (programs, classes, function groups)
- `sap_read_where_used` — cross-reference lookup (what uses X / what does X use)
- `sap_syntax_check` — validate ABAP source against the system's release rules
- `sap_read_dumps` — ST22 runtime errors (short dumps)
- `sap_read_jobs` — SM37 background jobs, status and runtimes

The full licensed platform exposes 80+ endpoints (natural-language query resolution, code generation, posting with approval gates, monitoring, transports); the connector's tool list follows the `/ABAPILOT/CONFIG` whitelist in your system — remove an endpoint there and the tool disappears, no client change needed.

## Security model

- Every call runs under the SAP user's own authorizations (S_TABU_DIS, S_DEVELOP, …) — enforced, not reimplemented
- Exposure limited to the `/ABAPILOT/CONFIG` whitelist table; anything not whitelisted is unreachable
- Full audit trail in `/ABAPILOT/AUDIT` (user, timestamp, parameters)
- Read-only by default; write operations require explicit configuration

## Getting access

ABAPilot is a commercial product by [Crimson Consulting SL](https://crimsonconsultingsl.com) (Valencia, Spain). This repository hosts public documentation.

**Request a demo:** https://crimsonconsultingsl.com/contact-crimson-consulting/ — POC deployment on your dev system takes about two hours.

## Why not SAP's ABAP MCP Server?

Different jobs: SAP's server (inside ADT for Eclipse/VS Code) is excellent for developer assistance on systems with modern ADT services. ABAPilot adds what it doesn't cover: business-user queries, systems without ADT services (most real-world ECC 6.0), governed whitelist+audit access, and model choice including fully local. Many teams run both — [full comparison here](https://crimsonconsultingsl.com/abapilot-vs-sap-abap-mcp-server/).
