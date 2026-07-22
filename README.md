# ABAPilot — AI & MCP Server for SAP ECC and On-Premise S/4HANA

ABAPilot is an in-system AI platform for SAP: natural-language business queries and AI-assisted ABAP development on the systems you already run — SAP ECC 6.0 through on-premise S/4HANA (any ABAP-based SAP instance). No BTP, no ADT, no RISE prerequisites. Deploys in ~2 hours.

**Install the connector:** `npm install -g abapilot` · requires a [licensed ABAPilot backend](https://crimsonconsultingsl.com/abapilot/)

**Website:** https://crimsonconsultingsl.com/abapilot/

**Architecture deep-dive:** [ARCHITECTURE.md](ARCHITECTURE.md)

**2026 guide — AI for SAP ECC:** https://crimsonconsultingsl.com/ai-for-sap-ecc/

**vs SAP's ABAP MCP Server:** https://crimsonconsultingsl.com/abapilot-vs-sap-abap-mcp-server/

<!-- mcp-name: io.github.NicoHern/abapilot-mcp -->

## Quick start

```json
{
  "mcpServers": {
    "abapilot": {
      "command": "npx",
      "args": ["-y", "abapilot"],
      "env": {
        "ABAPILOT_URL": "https://<sap-host>:<port>/sap/bc/abapilot",
        "ABAPILOT_USER": "<sap-user>",
        "ABAPILOT_PASSWORD": "<sap-password>"
      }
    }
  }
}
```

Your SAP credentials go only to your SAP system — never to us or any third party.

## How it works

- **Inside SAP:** pure-ABAP add-on delivered as a transport into the registered `/ABAPILOT/` namespace, attached to a single SICF (ICF) node with dynamic per-endpoint dispatch. No kernel changes, no Gateway, no BTP, no ADT/Eclipse dependency.
- **On your network:** this MCP connector (`npx abapilot`) links any MCP client — Claude, Claude Code, Cursor, ChatGPT — to the SAP-side endpoints.
- **Your model:** BYOK for Claude, OpenAI, Gemini, Amazon Bedrock — or fully local via Ollama for zero-data-retention deployments.

## Tools

- `sap_read_table_data` — query rows from any SAP table with optional WHERE filtering, under the calling user's authorizations
- `sap_read_table_structure` — field definitions of a table or structure: names, types, lengths, key fields, descriptions
- `sap_search_tables` — search the SAP Data Dictionary by keyword ('vendor' finds LFA1, LFB1, …)
- `sap_read_code` — read ABAP source from the connected system: programs, classes, function groups, includes, interfaces
- `sap_read_where_used` — cross-reference lookup (like SE84), forward and reverse
- `sap_syntax_check` — validate ABAP source against the connected system's release-accurate syntax rules (ECC 6.0 included)
- `sap_read_dumps` — read ST22 runtime errors (short dumps)
- `sap_read_jobs` — read SM37 background jobs: status, runtime, scheduling

## Security model

- Every call runs under the SAP user's own authorizations (S_TABU_DIS, S_DEVELOP, …) — enforced, not reimplemented
- Exposure limited to the `/ABAPILOT/CONFIG` whitelist table; anything not whitelisted is unreachable
- Full audit trail in `/ABAPILOT/AUDIT` (user, timestamp, parameters)
- Read-only by default; write operations require explicit configuration

## Getting access

ABAPilot is a commercial product by [Crimson Consulting SL](https://crimsonconsultingsl.com) (Valencia, Spain). The npm connector is free (MIT); the in-system backend is licensed.

**Request a demo:** https://crimsonconsultingsl.com/contact-crimson-consulting/ — POC deployment on your dev system takes about two hours.

## Why not SAP's ABAP MCP Server?

Different jobs: SAP's server (inside ADT for Eclipse/VS Code) is excellent for developer assistance on systems with modern ADT services. ABAPilot adds what it doesn't cover: business-user queries, systems without ADT services (most real-world ECC 6.0), governed whitelist+audit access, and model choice including fully local. Many teams run both — [full comparison here](https://crimsonconsultingsl.com/abapilot-vs-sap-abap-mcp-server/).
