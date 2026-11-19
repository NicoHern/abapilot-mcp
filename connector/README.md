# ABAPilot — governed SAP access for AI agents and ABAP developers

**ABAPilot connects Claude, GitHub Copilot, Codex, Cursor and any other MCP client to SAP ECC 6.0, S/4HANA on-premise and S/4HANA Cloud Private Edition (RISE).** It works for ABAP developers (read, explain, change and test code) and for business teams (query SAP data, run audit and finance checks, prepare data changes).

Every call runs **inside SAP, as the named SAP user**, under that user's own SAP authorizations, and is written to an audit table in your system. The AI never gets a shared technical user, a database connection or a path around SAP security.

ABAPilot has two parts:

| Component | What it is | Licence |
| --- | --- | --- |
| **ABAPilot backend** | ABAP objects in the `/ABAPILOT/` namespace, imported as a standard transport. HTTP service, endpoint registry, authorization layer, audit log. | Commercial |
| **MCP connector** (this repository, `npx -y abapilot`) | Thin Node.js process that exposes the backend endpoints as MCP tools to your AI client. | MIT, free |

Website: **[abapilot.ai](https://abapilot.ai)** · [Book a 30-minute live demo on a real system](https://crimsonconsultingsl.com/demo/)

---

## At a glance

| | |
| --- | --- |
| **SAP systems** | ECC 6.0 (SAP_BASIS 700 and up), S/4HANA on-premise, S/4HANA Cloud Private Edition (RISE). Not S/4HANA Cloud Public Edition. |
| **Prerequisites** | One transport import. No BTP, no Integration Suite, no ADT, no Cloud Connector. |
| **Identity** | The user's own SAP user: basic auth, bearer token, or Microsoft Entra ID sign-in for centrally hosted deployments. |
| **Authorization** | Standard SAP authorization checks (S_TABU_DIS / S_TABU_NAM, S_DEVELOP) plus a dedicated authorization object, `ZABPLT_EP`, that controls which capability groups each role may use. |
| **Audit** | Every call is logged in `/ABAPILOT/AUDIT` (user, endpoint, parameters, result, duration), denied calls included. |
| **AI clients** | Claude (Desktop, Code), GitHub Copilot, Codex, Cursor, Windsurf, Microsoft Copilot Studio, any MCP client. Bring your own model and API key. |
| **Price** | €800 per SAP system per month; €5,000 one-time setup. Free 30-day trial on your development system. |
| **Vendor** | [Crimson Consulting SL](https://crimsonconsultingsl.com), Valencia (Spain). SAP PartnerEdge partner, listed on SAP Store. |

## In use today

- **A French SAP data-management services firm**: paying customer, uses ABAPilot to document legacy ABAP code.
- **A Canadian agri-business co-operative**: development team working on ECC and S/4HANA systems together. [Case study](https://crimsonconsultingsl.com/abapilot-abap-mcp-server-any-ide/)
- **A US AI start-up**: embeds ABAPilot in its own platform as the SAP connection layer.
- **Five proofs of concept** under way with SAP customers and partners in Europe and Africa.
- Running on ECC 6.0 (SAP_BASIS 700 and 750) and S/4HANA (SAP_BASIS 757 and 758). See the [installation checks](https://github.com/NicoHern/abapilot-mcp/blob/main/ARCHITECTURE.md#verified-installations).

## Security model

ABAPilot does not replace SAP security. It works inside it. A request passes these layers in order:

1. **Endpoint registry (`/ABAPILOT/CONFIG`).** Only endpoints registered and active in your system exist. **Write endpoints are delivered switched off**; your administrator turns on the ones you need. Switch one off and the tool is gone for every client, with no client change. A read-only installation is a configuration choice, not a different product.
2. **Capability authorization (`ZABPLT_EP`).** Endpoints are grouped by capability (read data, read code, write code, administration and others). Your roles grant each group with an activity. An endpoint without a mapping is denied. If the authorization engine itself fails, the request is denied (fail-closed). The engine can run in `SHADOW` mode (decide and log only) while you design roles, then in `ENFORCE` mode.
3. **Standard SAP checks in each handler.**
   - Table reads call `VIEW_AUTHORITY_CHECK`: table authorization groups (S_TABU_DIS), table names (S_TABU_NAM) and organizational row criteria, exactly as SM30 or SE16 would.
   - Reading source code requires S_DEVELOP display on that object. Writing requires S_DEVELOP change (02), deleting requires 06.
4. **Hard guards.** No repository changes in a client flagged as productive in T000 unless an administrator explicitly allows it. ABAPilot's own configuration tables can only be read by ABAPilot administrators. Configurable table blocklists (for example `PA*`, `USR02`) and a function-module denylist apply regardless of role.
5. **Audit.** Every request and every denial is written to `/ABAPILOT/AUDIT` in your system.

On the client side, `ABAPILOT_TOOLS` hides tools a particular user does not need. It keeps the AI's tool list short and focused. It is a convenience, not a security control: the controls are layers 1 to 5 above, inside SAP.

### Recommended trial profile: read-only on DEV

For a first trial we recommend: development system only, each developer with their own SAP user, `ZABPLT_EP` in `ENFORCE` mode, write endpoints left in their delivered off state and program execution switched off. Add write access later, per role, when your team is ready.

## SAP S/4HANA Cloud Private Edition (RISE)

ABAPilot runs on RISE the same way it runs on-premise, because it is ordinary ABAP in your own namespace:

1. **Import the transport.** Request the import through your SAP ECS / RISE service channel, or your partner if they manage transports for you. No SAP Note, modification or repair key is needed.
2. **Activate the HTTP service** (`/sap/bc/abapilot`) in SICF.
3. **Network.** The MCP connector must reach the SAP HTTPS endpoint. On RISE that means your existing private connection (VNet peering or VPN from your Azure, AWS or on-premise network). Any integration option needs the same path.
4. **Users and roles.** Assign the delivered template roles, or build your own from the `ZABPLT_EP` capability groups.

S/4HANA Cloud Public Edition is not supported: its extensibility model does not allow custom ABAP backends of this kind.

## SAP API Policy

SAP's API Policy and its rules on third-party AI agents are a legitimate question for every customer. Here is how ABAPilot is built, so you can assess it with your SAP account team:

- ABAPilot runs as **customer-namespace ABAP inside your system**, installed and owned by you, like any custom development.
- It does not read the database directly or use RFC_READ_TABLE. Every action goes through ABAP code that applies SAP's own authorization checks.
- It acts **on behalf of the named user**, with that user's SAP rights, and is fully audited.

ABAPilot is not an SAP-certified integration. We are happy to walk your architecture and compliance teams through the design.

## Quick start

The connector needs an ABAPilot backend in your SAP system. [Request a trial](https://crimsonconsultingsl.com/demo/); installation on a development system takes about two hours.

```json
{
  "mcpServers": {
    "abapilot": {
      "command": "npx",
      "args": ["-y", "abapilot"],
      "env": {
        "ABAPILOT_URL": "https://<sap-host>:<port>/sap/bc/abapilot",
        "ABAPILOT_USER": "<your-sap-user>",
        "ABAPILOT_PASSWORD": "<your-sap-password>",
        "ABAPILOT_CLIENT": "100"
      }
    }
  }
}
```

| Variable | Required | Description |
| --- | --- | --- |
| `ABAPILOT_URL` | yes | HTTPS URL of the ABAPilot service in your SAP system |
| `ABAPILOT_USER` / `ABAPILOT_PASSWORD` | one of the two | Your own SAP user (basic authentication) |
| `ABAPILOT_TOKEN` | one of the two | Bearer token, for centrally hosted deployments |
| `ABAPILOT_CLIENT` | no | SAP client (Mandant) |
| `ABAPILOT_TOOLS` | no | Comma-separated list of tools to show this client |
| `ABAPILOT_TLS_INSECURE` | no | `1` skips TLS certificate verification. Development systems only. |

Your credentials go only to your SAP system. Pin a connector version for team rollouts. [IDE setup guide](https://crimsonconsultingsl.com/abapilot-abap-mcp-server-any-ide/).

## Tools

The connector publishes 49 tools. Which ones work in your system is decided by the endpoints active in `/ABAPILOT/CONFIG` and by your roles. The backend offers further capabilities (data quality and migration cleansing, SAP Note analysis, OData services, Fiori deployment) that are enabled per installation.

**Business data**

- `sap_read_table_data` — Read rows from a SAP table, with filtering, under the user's table authorizations
- `sap_read_table_data_enhanced` — Query a SAP table with filtering and field metadata
- `sap_read_table_paginated` — Read large tables page by page
- `sap_stream_table_data` — Stream large tables with offset-based paging
- `sap_smart_table_query` — Table query with automatic metadata-driven enrichment
- `sap_multi_table_query` — Query several tables with joins and optional aggregation
- `sap_count_rows` — Count rows before fetching data
- `sap_analyze_query` — Turn a natural-language question into a plan of SAP tables and fields
- `sap_search_tables` — Search the Data Dictionary by keyword

**Data Dictionary & metadata**

- `sap_read_table_structure` — Fields, types, keys and descriptions of a table
- `sap_read_object_details` — Details of any repository or DDIC object
- `sap_read_object_info` — Creation and change date, author and package of an object
- `sap_check_type_exists` — Check whether a type exists and what kind it is
- `sap_read_domain_values` — Fixed values of a domain
- `sap_read_field_domain_values` — Fixed values for a table field
- `sap_read_foreign_keys` — Foreign key relationships of a table
- `sap_infer_joins` — Detect join keys between two tables
- `sap_get_field_metadata` — Field metadata with semantic classification
- `sap_list_package_objects` — All repository objects in a package

**ABAP code**

- `sap_read_code` — Source of a program, class or function group (requires S_DEVELOP display)
- `sap_read_includes` — All includes of a program with their source
- `sap_read_dynpros` — Screen definitions and field lists
- `sap_read_texts` — Text elements and selection texts
- `sap_read_where_used` — Where-used list and dependencies from SAP cross-reference tables
- `sap_get_enhancements` — All enhancements for a transaction or program
- `sap_syntax_check` — Syntax-check ABAP source without saving it
- `sap_write_code` — Write ABAP source and activate it; requires S_DEVELOP change authorization; reports whether activation succeeded
- `sap_write_code_safe` — Guided write workflow for ABAP source, including ECC 6.0 compatibility handling
- `sap_patch_code` — Change part of an existing program or class without resending the whole source

**Operations & troubleshooting**

- `sap_read_dumps` — Runtime errors (ST22)
- `sap_read_dump_details` — Full detail of a dump: error text, cause, call stack
- `sap_read_syslog` — System log (SM21)
- `sap_read_jobs` — Background jobs (SM37)
- `sap_run_program` — Run an ABAP report and return its list output (off in the read-only profile)
- `sap_run_transaction` — Run the report behind a report transaction, optionally with a variant
- `sap_save_variant` — Create or update a selection-screen variant
- `sap_read_user_locks` — User lock status
- `sap_diagnose_message` — Diagnose an SAP message end to end
- `sap_lookup_t100` — Look up a T100 message
- `sap_lookup_error` — Explain an SAP error message

**Audit & compliance**

- `sap_read_change_docs` — Change documents (CDHDR / CDPOS)
- `sap_read_change_docs_v2` — Change documents through function modules, faster on large volumes
- `sap_discover_change_object` — Find the change document object for a table
- `sap_scan_security_notes` — Rank the month's security and HotNews notes by relevance to this system
- `sap_check_notes_relevancy` — Check SAP Notes against this system's components and support packages

**Translation**

- `sap_read_translations` — Translatable texts of an object
- `sap_write_translations` — Write translated texts back
- `sap_translate` — Read, translate with AI and optionally write back

**Knowledge**

- `sap_search_knowledge` — Search SAP documentation and community content

## What has been verified

- **Reads and syntax check** on four installations (two ECC, two S/4HANA), 9 September 2026. [Details and method](https://github.com/NicoHern/abapilot-mcp/blob/main/ARCHITECTURE.md#verified-installations).
- **A full code-change workflow, from write and activation through tests**, recorded end to end with Claude Code on a sandbox system: an existing report is changed and documented, then 14 ABAP Unit tests pass. [Watch the three-minute video](https://youtu.be/-AZBPH3gAkw) · [Technical case](https://crimsonconsultingsl.com/ai-for-abap-development/#abap-change-tests-documentation)
- **The REST framework** that ABAPilot's dispatcher is built on is open source: [ABAP Dynamic REST](https://github.com/NicoHern/abap-dynamic-rest) (MIT).

Before production use, run your own trial on your release and your workflows. We help you do that.

## Further reading

- [Architecture and request flow](https://github.com/NicoHern/abapilot-mcp/blob/main/ARCHITECTURE.md)
- [ABAPilot compared with SAP's ABAP MCP Server](https://crimsonconsultingsl.com/abapilot-vs-sap-abap-mcp-server/)
- [Engineering write-up on SAP Community: running AI agents against SAP ECC 6.0](https://community.sap.com/t5/technology-blog-posts-by-members/running-ai-agents-against-sap-ecc-6-0-lessons-from-building-an-in-system/ba-p/14468622)
- [AI for SAP ECC guide](https://crimsonconsultingsl.com/ai-for-sap-ecc/)

<!-- mcp-name: io.github.NicoHern/abapilot-mcp -->

---

© Crimson Consulting SL. Connector released under the MIT licence; the ABAPilot backend is a commercial product.
