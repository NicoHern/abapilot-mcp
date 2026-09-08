# ABAPilot — MCP connector for ABAP development on SAP ECC and S/4HANA

ABAPilot by Crimson Consulting connects AI coding assistants to SAP ECC and on-premise S/4HANA. Use SAP source code and dictionary context to understand existing ABAP, review proposed changes and support development from your preferred MCP-capable coding client.

**The connector is free and MIT-licensed. Connecting to SAP requires a licensed ABAPilot backend installed in your system.**

- [Watch the four-minute developer demo](https://crimsonconsultingsl.com/abapilot-demo-video/)
- [Set up your IDE](https://crimsonconsultingsl.com/abapilot-abap-mcp-server-any-ide/)
- [Book a live ABAP workflow demo](https://crimsonconsultingsl.com/demo/)

### Start with an existing ABAP program

Ask your assistant to explain a program using source and dictionary definitions retrieved from SAP. Review the references it used before moving to a proposed change. Available operations depend on the connector version, installed backend and enabled endpoints.

### Architecture and prerequisites

The MCP connector runs outside SAP and calls the licensed SAP-side backend. Agree the SAP release, backend version, HTTPS endpoint, individual user permissions and permitted operations with your SAP team before a customer trial.

Start the connector using `npx -y abapilot`. This command does not install the SAP backend. Follow the linked setup guide for client-specific configuration and secret handling. Pin a reviewed connector version for repeatable team rollouts.

<!-- mcp-name: io.github.NicoHern/abapilot-mcp -->

**Technical reference:** [Architecture](https://github.com/NicoHern/abapilot-mcp/blob/main/ARCHITECTURE.md)

## Tools

The current repository catalog lists 49 tools. Availability depends on the installed connector, backend version and enabled endpoints.

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

The licensed backend may expose operations beyond this public catalog. Agree the required capabilities and verify them on the deployed version before a trial.

## Validation and data handling

The public connector includes source and dictionary readers, syntax checking and both validated and low-level write operations. A syntax check must not be assumed for every write. Confirm the enabled endpoints, validation behavior, authorization failures and log attribution on your deployed version.

Review which SAP context your chosen AI client and model provider receive. Using your own API key does not by itself establish local processing or a particular retention policy.

### Evaluate the workflow

The recorded demo shows one sandbox workflow. In a live demo we can discuss your system, IDE and requirements before agreeing a customer trial. [Choose a time](https://crimsonconsultingsl.com/demo/).

## Further reading

- [Engineering write-up on SAP Community](https://community.sap.com/t5/technology-blog-posts-by-members/running-ai-agents-against-sap-ecc-6-0-lessons-from-building-an-in-system/ba-p/14468622)
- [AI for SAP ECC guide](https://crimsonconsultingsl.com/ai-for-sap-ecc/)
- [Compare SAP prerequisites and approaches](https://crimsonconsultingsl.com/abapilot-vs-sap-abap-mcp-server/)
