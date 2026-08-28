# ABAPilot — AI & MCP Server for SAP ECC and On-Premise S/4HANA

ABAPilot is an in-system AI platform for SAP: natural-language business queries and AI-assisted ABAP development on the systems you already run — SAP ECC 6.0 through on-premise S/4HANA (any ABAP-based SAP instance). No BTP, no ADT, no RISE prerequisites. Deploys in ~2 hours.

**Install the connector:** `npx -y abapilot` · requires a [licensed ABAPilot backend](https://crimsonconsultingsl.com/abapilot/)

**Website:** https://crimsonconsultingsl.com/abapilot/

**Architecture deep-dive:** [ARCHITECTURE.md](ARCHITECTURE.md)

**Watch a real session (4 min):** https://youtu.be/r9mg-gxKQQ0

**2026 guide — AI for SAP ECC:** https://crimsonconsultingsl.com/ai-for-sap-ecc/

**Engineering write-up (SAP Community):** [Running AI agents against SAP ECC 6.0 — lessons from building an in-system MCP server](https://community.sap.com/t5/technology-blog-posts-by-members/running-ai-agents-against-sap-ecc-6-0-lessons-from-building-an-in-system/ba-p/14468622)

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
        "ABAPILOT_URL": "http://<sap-host>:<port>/sap/bc/ZABAPilot",
        "ABAPILOT_USER": "<sap-user>",
        "ABAPILOT_PASSWORD": "<sap-password>",
        "ABAPILOT_CLIENT": "100"
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

49 tools, each mapping 1:1 to an endpoint of the ABAPilot dispatcher inside your SAP system.

**Business data**

- `sap_read_table_data` — Reads actual data from a SAP table with optional WHERE clause filtering and metadata inclusion
- `sap_read_table_data_enhanced` — Query data from an SAP table with optional WHERE clause filtering
- `sap_read_table_paginated` — Read table data with pagination support for large result sets
- `sap_stream_table_data` — Streams large table data using offset-based pagination
- `sap_smart_table_query` — Execute a table query with automatic metadata-driven enhancements
- `sap_multi_table_query` — Execute a multi-table query with proper joins and optional aggregation
- `sap_count_rows` — Estimate row count for a table BEFORE fetching data
- `sap_analyze_query` — Analyze a natural language query and return intelligent guidance for building the SAP query
- `sap_search_tables` — Search the Data Dictionary for tables matching a keyword

**Data Dictionary & metadata**

- `sap_read_table_structure` — Retrieves the metadata of a Data Dictionary table including field definitions, data types, keys, and descriptions
- `sap_read_object_details` — Read comprehensive details about any SAP repository or DDIC object
- `sap_read_object_info` — Get metadata about an ABAP object including creation date, last changed date, author, and package
- `sap_check_type_exists` — Checks whether a type exists in the SAP Data Dictionary and returns its kind
- `sap_read_domain_values` — Retrieves the fixed values defined for a domain
- `sap_read_field_domain_values` — Get domain fixed values for a specific table field
- `sap_read_foreign_keys` — Read foreign key relationships for a table from Data Dictionary (DD08L)
- `sap_infer_joins` — Automatically detect join keys between two tables based on domain matching
- `sap_get_field_metadata` — Get enriched metadata for SAP table fields with semantic classification
- `sap_list_package_objects` — List all ABAP repository objects in a development package (DEVCLASS)

**ABAP code**

- `sap_read_code` — Retrieves the source code of an ABAP object (program, class, or function group)
- `sap_read_includes` — Retrieves all include files for a program with their source code
- `sap_read_dynpros` — Retrieves screen definitions for a program including field lists
- `sap_read_texts` — Retrieves text elements (selection texts, text symbols) for a program
- `sap_read_where_used` — Queries SAP's cross-reference tables (WBCROSSGT/WBCROSSI) to find what objects use a given object (forward) or what a given object uses (inverse)
- `sap_get_enhancements` — List ALL enhancements for a SAP transaction or program in one call
- `sap_syntax_check` — Validates ABAP source code for syntax errors without creating or activating it
- `sap_write_code` — Low-level ABAP write endpoint
- `sap_write_code_safe` — Write ABAP code to SAP with validation and optional ECC 6.0 auto-fixing
- `sap_patch_code` — Apply delta modifications to existing ABAP programs or classes without sending full source

**Operations & troubleshooting**

- `sap_read_dumps` — Query ABAP runtime errors (short dumps) from SAP's ST22 transaction
- `sap_read_dump_details` — Get detailed information for a specific short dump including full error texts, cause, and solution
- `sap_read_syslog` — Query system log entries from SAP's SM21 transaction
- `sap_read_jobs` — Query background job information from SAP's SM37 transaction
- `sap_run_program` — Execute an ABAP report program (SUBMIT) and return its list output as text lines
- `sap_run_transaction` — Run the ABAP report behind a report transaction code, optionally with a selection-screen variant, and return its list output
- `sap_save_variant` — Create or overwrite an ABAP selection-screen VARIANT for a report, so it can be reused by sap_run_program (and the performance trace / headless…
- `sap_read_user_locks` — Query user lock status from USR02 table
- `sap_diagnose_message` — Diagnose a SAP error/warning/info message end-to-end
- `sap_lookup_t100` — Look up a specific SAP T100 message by message class and number
- `sap_lookup_error` — Analyze a SAP error message using all available external knowledge sources

**Audit & compliance**

- `sap_read_change_docs` — Query change documents from CDHDR/CDPOS tables
- `sap_read_change_docs_v2` — Optimized change document query using function modules
- `sap_discover_change_object` — Find the change document OBJECTCLAS for a table by querying TCDOB
- `sap_scan_security_notes` — Discover ABAP Security/HotNews notes for a SAP patch-day month and rank them by relevancy to this system
- `sap_check_notes_relevancy` — Check relevancy of one or more SAP Note numbers against this system (component/SP levels, download state, implementation readiness)

**Translation**

- `sap_read_translations` — Reads translatable texts from a SAP object in source and optionally target language
- `sap_write_translations` — Writes translated texts back to a SAP object
- `sap_translate` — Composite tool: reads translatable texts from a SAP object, translates them using AI, and optionally writes them back

**Knowledge**

- `sap_search_knowledge` — Search SAP documentation and community for information on any SAP topic

The catalog is gated in two places. In your system, the `/ABAPILOT/CONFIG` (or `/TSRA/CONFIG`) endpoint registry decides which endpoints are live — switch one off and the tool stops working, with no client change. On the client side, `ABAPILOT_TOOLS` narrows what a given MCP client sees:

```json
"env": { "ABAPILOT_TOOLS": "sap_read_table_data,sap_read_code,sap_syntax_check" }
```

The licensed backend serves more than this connector exposes — 90+ active endpoints on a current ECC install, including transports and CTS, PFCG roles and SU24, SAP Note download and implementation, customizing writes, ABAP Unit, ATC, and SPAU/SPDD adjustment replay. The tools above are the subset with stable public schemas.

## Security model

- Every call runs under the SAP user's own authorizations (S_TABU_DIS, S_DEVELOP, …) — enforced, not reimplemented
- Exposure limited to the `/ABAPILOT/CONFIG` whitelist table; anything not whitelisted is unreachable
- Full audit trail in `/ABAPILOT/AUDIT` (user, timestamp, parameters)
- Write endpoints (`sap_write_code`, `sap_patch_code`, `sap_write_translations`, …) ship switched off; a
  customer administrator activates them per endpoint in the registry

## Getting access

ABAPilot is a commercial product by [Crimson Consulting SL](https://crimsonconsultingsl.com) (Valencia, Spain). The npm connector is free (MIT); the in-system backend is licensed.

**Book a demo:** https://crimsonconsultingsl.com/demo/ — 30 minutes on a live system, you pick the task. POC deployment on your dev system takes about two hours.

## Why not SAP's ABAP MCP Server?

Different jobs: SAP's server (inside ADT for Eclipse/VS Code) is excellent for developer assistance on systems with modern ADT services. ABAPilot adds what it doesn't cover: business-user queries, systems without ADT services (most real-world ECC 6.0), governed whitelist+audit access, and model choice including fully local. Many teams run both — [full comparison here](https://crimsonconsultingsl.com/abapilot-vs-sap-abap-mcp-server/).
