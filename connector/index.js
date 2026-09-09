#!/usr/bin/env node
/**
 * ABAPilot MCP Connector
 * ----------------------
 * Thin Model Context Protocol server that connects any MCP client
 * (Claude, Claude Code, Codex, Cursor, VS Code) to a licensed ABAPilot
 * backend running inside an SAP system (/ABAPILOT/ or /TSRA/ namespace).
 *
 * This connector contains no business logic. Each tool maps 1:1 to an
 * endpoint of the ABAPilot dispatcher (SICF service). Every operation
 * executes inside SAP, gated by the customer-controlled endpoint registry
 * (IS_ACTIVE per endpoint), the calling user's SAP authorizations, and the
 * audit log in the customer's own system. A tool listed here is only
 * callable if the customer's backend has that endpoint switched on.
 *
 * Configuration (environment variables):
 *   ABAPILOT_URL       Base URL of the ABAPilot SICF service
 *                      e.g. http://sap-dev.example.com:8000/sap/bc/ZABAPilot
 *   ABAPILOT_USER      SAP user for the connection
 *   ABAPILOT_PASSWORD  SAP password (or use ABAPILOT_TOKEN)
 *   ABAPILOT_TOKEN     Bearer token, if your gateway issues one
 *   ABAPILOT_CLIENT    SAP client (Mandant), e.g. 100 (optional)
 *   ABAPILOT_TOOLS     Comma-separated allowlist of tool names to expose
 *                      (optional; default is the full catalog below)
 *   ABAPILOT_TLS_INSECURE  Set to "1" to skip TLS verification (dev only)
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const VERSION = "1.0.6";

const cfg = {
  url: process.env.ABAPILOT_URL ?? "",
  user: process.env.ABAPILOT_USER ?? "",
  password: process.env.ABAPILOT_PASSWORD ?? "",
  token: process.env.ABAPILOT_TOKEN ?? "",
  client: process.env.ABAPILOT_CLIENT ?? "",
  allowlist: (process.env.ABAPILOT_TOOLS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  tlsInsecure: process.env.ABAPILOT_TLS_INSECURE === "1",
};

const NOT_CONFIGURED =
  "ABAPilot connector is running without a backend: ABAPILOT_URL is not set. " +
  "Point it at your ABAPilot SICF service, e.g. " +
  "ABAPILOT_URL=http://<sap-host>:<port>/sap/bc/ZABAPilot " +
  "(plus ABAPILOT_USER/ABAPILOT_PASSWORD or ABAPILOT_TOKEN). " +
  "A licensed ABAPilot backend is required: https://crimsonconsultingsl.com/abapilot/ " +
  "Book a walkthrough on a live ECC or S/4HANA system: https://crimsonconsultingsl.com/demo/";

if (!cfg.url) {
  // Keep running so MCP clients and registries can introspect the tool
  // catalog; every tool call returns setup instructions instead.
  console.error(NOT_CONFIGURED);
}

if (cfg.tlsInsecure) {
  // Development systems with self-signed certificates only.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

// SAP object identifiers are stored upper-case; free-text arguments
// (WHERE clauses, search terms, source code) are passed through untouched.
const UPPER_FIELDS = new Set([
  "table_name",
  "object_name",
  "object_type",
  "program_name",
  "function_name",
  "class_name",
  "method_name",
  "role_name",
  "transaction",
  "tcode",
  "report",
]);

function normalize(args) {
  const out = {};
  for (const [k, v] of Object.entries(args ?? {})) {
    out[k] = UPPER_FIELDS.has(k) && typeof v === "string" ? v.toUpperCase() : v;
  }
  return out;
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
  } else if (cfg.user) {
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
  } catch (e) {
    return {
      ok: false,
      error:
        `Cannot reach the ABAPilot endpoint at ${url} \u2014 ` +
        `check ABAPILOT_URL, network/VPN access to the SAP system, and that ` +
        `the SICF service is active. (${e.message})`,
    };
  }
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 404) {
      return {
        ok: false,
        error:
          `SAP endpoint ${path} returned HTTP 404. This endpoint is either not ` +
          `installed or switched off in your backend's endpoint registry ` +
          `(/TSRA/CONFIG or /ABAPILOT/CONFIG, field IS_ACTIVE). Ask your SAP ` +
          `administrator to activate it.`,
      };
    }
    return {
      ok: false,
      error: `SAP endpoint ${path} returned HTTP ${res.status}: ${text.slice(0, 500)}`,
    };
  }
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    // Endpoint returned non-JSON (plain text or ABAP-formatted output)
    return { ok: true, data: text };
  }
}

// ---------------------------------------------------------------------------
// Tool catalog. Each entry maps 1:1 to an ABAPilot dispatcher endpoint; the
// names, descriptions and schemas are the ones the ABAPilot backend itself
// serves. The connecting AI supplies the reasoning (which table, which WHERE
// clause); SAP supplies the answer, under the user's own authorizations.
// ---------------------------------------------------------------------------
const TOOLS = [
  {
    "name": "sap_analyze_query",
    "endpoint": "/analyze_query",
    "description": "Analyze a natural language query and return intelligent guidance for building the SAP query. This tool examines your query and returns: - Candidate tables to query - Query type (simple, multi-table, aggregation) - Detected date ranges - Aggregation hints (TOP N, SUM, COUNT) - Field recommendations with semantic context USE THIS FIRST before building complex queries to get field guidance!",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Natural language query (e.g., 'top 10 customers by sales in 2024')"
        },
        "fetch_metadata": {
          "type": "boolean",
          "description": "If true, also fetch and classify field metadata for identified tables (default: true)",
          "default": true
        }
      },
      "required": [
        "query"
      ]
    }
  },
  {
    "name": "sap_check_notes_relevancy",
    "endpoint": "/check_notes_relevancy",
    "description": "Check relevancy of one or more SAP Note numbers against this system (component/SP levels, download state, implementation readiness). Composite tool: classifies each note via the /classify_note_v2 gateway endpoint and aggregates the results. Notes that were never downloaded into SNOTE are reported with needs_download=true \u2014 run sap_download_note_v2 (requires OSS connectivity) or sap_upload_note_v2 first for a definitive verdict on those.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "note_ids": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "SAP Note numbers to check (e.g., [\"2198647\", \"1626838\"])"
        }
      },
      "required": [
        "note_ids"
      ]
    }
  },
  {
    "name": "sap_check_type_exists",
    "endpoint": "/check_type_exists",
    "description": "Checks whether a type exists in the SAP Data Dictionary and returns its kind. Returns type_kind: TABL (transparent/cluster/pool table \u2014 queryable), STRU (structure \u2014 NOT queryable, cannot SELECT from it), VIEW (database view \u2014 queryable), DTEL (data element), TTYP (table type), BUILTIN, TYPEPOOL. Use this to verify whether an object is a real database table before attempting sap_read_table_data or sap_count_rows.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "type_name": {
          "type": "string",
          "description": "Type name to check",
          "example": "MARA"
        }
      },
      "required": [
        "type_name"
      ]
    }
  },
  {
    "name": "sap_count_rows",
    "endpoint": "/count_rows",
    "description": "Estimate row count for a table BEFORE fetching data. Use this to check if a query will return too much data. Returns estimated count and recommendation (direct_read, use_pagination, use_streaming). ALWAYS use this before querying large tables like BKPF, EKKO, VBAK without date filters!",
    "inputSchema": {
      "type": "object",
      "properties": {}
    }
  },
  {
    "name": "sap_diagnose_message",
    "endpoint": "/diagnose_message",
    "description": "Diagnose a SAP error/warning/info message end-to-end. USE THIS when a user shares a SAP message \u2014 whether as a screenshot, text, or message ID. This tool performs a full diagnostic chain: 1. Resolves message class + number (from T100 text search if only text is provided) 2. Locates the exact source code line where the message is raised 3. Reads surrounding code to understand the triggering condition 4. Checks for active enhancements that may interfere 5. Returns a structured diagnosis with root cause analysis and fix suggestions. INPUT: Provide EITHER message_id + message_number (if known) OR message_text (from screenshot). Optionally provide transaction or program_name to scope the search.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "message_id": {
          "type": "string",
          "description": "Message class (e.g., V1, F5, ME). Omit if only message text is available."
        },
        "message_number": {
          "type": "string",
          "description": "Message number (e.g., 001, 312). Omit if only message text is available."
        },
        "message_text": {
          "type": "string",
          "description": "Message text from screenshot or user description. Used to reverse-lookup message class/number from T100 when message_id is not known."
        },
        "transaction": {
          "type": "string",
          "description": "SAP transaction code where the message appeared (e.g., VA01, FB01, ME21N)"
        },
        "program_name": {
          "type": "string",
          "description": "ABAP program name (e.g., SAPMV45A). Optional if transaction is provided."
        },
        "language": {
          "type": "string",
          "description": "SAP language key for T100 search (e.g., S=Spanish, E=English, D=German). Default: S.",
          "default": "S"
        }
      }
    }
  },
  {
    "name": "sap_discover_change_object",
    "endpoint": "/discover_change_object",
    "description": "Find the change document OBJECTCLAS for a table by querying TCDOB. Use this before querying change documents if you don't know the object class.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table_name": {
          "type": "string",
          "description": "Data Dictionary table name",
          "example": "MARA"
        }
      },
      "required": [
        "table_name"
      ]
    }
  },
  {
    "name": "sap_get_enhancements",
    "endpoint": "/get_enhancements",
    "description": "List ALL enhancements for a SAP transaction or program in one call. Returns BAdIs (new + classic), customer exits (SMOD/CMOD), enhancement spots (implicit/explicit), and BTEs (Business Transaction Events). Each entry includes: type, name, implementation, active status, program, and include name. USE THIS when the user asks about enhancements, BAdIs, customer exits, user exits, SMOD, CMOD, SE18, SE19, BTEs, extension points, or custom code on a transaction. Pass transaction (e.g., 'BP', 'VA01', 'XD01') or program_name (e.g., 'SAPMV45A'). DO NOT manually query SXS_ATTR, SXC_ATTR, MODSAP, or MODACT \u2014 use this tool instead.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "program_name": {
          "type": "string",
          "description": "ABAP program name (e.g., SAPMF02D for XD01/XD02, SAPMV45A for VA01)"
        },
        "transaction": {
          "type": "string",
          "description": "SAP transaction code (e.g., XD01, VA01, BP, MM02, ME21N). The program is resolved automatically."
        }
      },
      "description": "At least one of program_name or transaction is required."
    }
  },
  {
    "name": "sap_get_field_metadata",
    "endpoint": "/get_field_metadata",
    "description": "Get enriched metadata for SAP table fields with semantic classification. Returns field classifications including: - Amount fields (for SUM) with their currency field mappings - Customer fields distinguished by role (sold_to=KUNAG, payer=KUNRG, bill_to, ship_to) - Status/flag fields (deletion, cancellation indicators) with filter recommendations - Date fields for filtering - Currency fields USE THIS BEFORE building queries to understand which fields to use! Example: For 'top customers by sales', this tells you to use KUNAG (sold-to) not KUNRG (payer).",
    "inputSchema": {
      "type": "object",
      "properties": {}
    }
  },
  {
    "name": "sap_infer_joins",
    "endpoint": "/infer_joins",
    "description": "Automatically detect join keys between two tables based on domain matching. Compares field domains to suggest join keys with confidence levels.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table1": {
          "type": "string",
          "description": "First table name",
          "example": "EKKO"
        },
        "table2": {
          "type": "string",
          "description": "Second table name",
          "example": "EKPO"
        }
      },
      "required": [
        "table1",
        "table2"
      ]
    }
  },
  {
    "name": "sap_list_package_objects",
    "endpoint": "/list_package_objects",
    "description": "List all ABAP repository objects in a development package (DEVCLASS). Returns objects grouped by type: programs (PROG), classes (CLAS), function groups (FUGR), tables (TABL), data elements (DTEL), domains (DOMA), structures (STRU), views (VIEW), etc. Use this to discover and inventory a codebase for documentation, migration analysis, or code review. Supports wildcard package names (e.g., 'Z*' for all Z packages). Also returns sub-packages if they exist. For custom namespace codebases, pass the top-level package and set include_subpackages=true.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "package": {
          "type": "string",
          "description": "Development package / DEVCLASS (e.g., 'ZCUSTOM', '/NAMESPACE/PKG')"
        },
        "include_subpackages": {
          "type": "boolean",
          "default": false,
          "description": "If true, also scan sub-packages (reads TDEVC for hierarchy)"
        },
        "object_type_filter": {
          "type": "string",
          "description": "Optional: filter by object type (e.g., 'PROG', 'CLAS', 'FUGR', 'TABL'). Leave empty for all."
        }
      },
      "required": [
        "package"
      ]
    }
  },
  {
    "name": "sap_lookup_error",
    "endpoint": "/lookup_error",
    "description": "Analyze a SAP error message using all available external knowledge sources. Queries: T100 message table, SAP Help Portal, web search (SAP community, StackOverflow), SAP Notes (if S-user configured), and previously learned error patterns. Use this AFTER getting dump/syslog data to understand root cause. Returns ranked results from multiple sources with links to documentation.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "error_message": {
          "type": "string",
          "description": "The error message to analyze. Can include SAP message codes like 'ME 003', dump error texts, or any error description from SAP."
        },
        "context": {
          "type": "string",
          "description": "Optional additional context: transaction code, program name, or description of what was happening when the error occurred."
        },
        "sources": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "t100",
              "sap_help",
              "web",
              "sap_notes",
              "learned"
            ]
          },
          "description": "Optional list of sources to query. Defaults to all. Values: t100 (SAP messages), sap_help (documentation), web (community/StackOverflow), sap_notes (SAP Notes), learned (previously seen patterns)."
        }
      },
      "required": [
        "error_message"
      ]
    }
  },
  {
    "name": "sap_lookup_t100",
    "endpoint": "/lookup_t100",
    "description": "Look up a specific SAP T100 message by message class and number. Use this when you see a message code like 'ME 003' or 'MM 001' in error messages, dumps, or syslog entries. Returns the full message text with placeholder descriptions.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "message_class": {
          "type": "string",
          "description": "SAP message class (e.g., 'ME', 'MM', 'VL', 'SD')",
          "pattern": "^[A-Za-z0-9_/]+$",
          "maxLength": 20
        },
        "message_number": {
          "type": "string",
          "description": "Message number (e.g., '003', '001', '100')",
          "pattern": "^[0-9]+$",
          "maxLength": 3
        },
        "language": {
          "type": "string",
          "description": "Language key (default 'E' for English). Use SAP internal codes: E=English, D=German.",
          "default": "E",
          "maxLength": 1
        }
      },
      "required": [
        "message_class",
        "message_number"
      ]
    }
  },
  {
    "name": "sap_multi_table_query",
    "endpoint": "/multi_table_query",
    "description": "Execute a multi-table query with proper joins and optional aggregation. Use this when you need data from 2+ tables that must be merged. Provide a JSON query plan with steps for each table, merge configuration, and optional aggregation. SUPPORTS AGGREGATION: For 'top N' queries, use the aggregation section to group, sum, sort, and limit results. IMPORTANT: Use this instead of multiple sap_read_table_data calls when you need joined data! CRITICAL - depends_on: When querying lookup/master data tables (KNA1, LFA1, MARA, etc.), ALWAYS use 'depends_on' and 'filter_field' to filter by keys from the primary table. This avoids querying the ENTIRE master data table. Example: To get customer names for sales orders, set KNA1 step with depends_on='orders', filter_field='KUNNR' \u2014 this queries only the customers in your order results. Without depends_on, KNA1 returns ALL customers (100K+) causing timeouts. NOTE: If the query returns more than 1000 rows, you will receive a 'requires_confirmation' response. You MUST ask the user if they want to see all the data. For 'last N' or 'most recent' requests, use sort_by + sort_order + limit instead of confirmed=true. Example: sort_by='WADAT_IST', sort_order='desc', limit=10 returns the 10 most recent deliveries. Fields in WHERE clauses and field lists are validated against table structure. Use sap_get_field_metadata or sap_read_table_structure first to discover correct field names.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query_plan": {
          "type": "object",
          "description": "Query plan with steps and merge configuration",
          "properties": {
            "explanation": {
              "type": "string",
              "description": "Human-readable explanation of what this query returns"
            },
            "steps": {
              "type": "array",
              "description": "List of table queries to execute",
              "items": {
                "type": "object",
                "properties": {
                  "table": {
                    "type": "string",
                    "description": "SAP table name (e.g., EKKO)"
                  },
                  "fields": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    },
                    "description": "Fields to select"
                  },
                  "where": {
                    "type": "string",
                    "description": "WHERE clause (optional)"
                  },
                  "alias": {
                    "type": "string",
                    "description": "Alias for this result set"
                  },
                  "depends_on": {
                    "type": "string",
                    "description": "Alias of parent step to filter by. REQUIRED for master data lookups (KNA1, LFA1, MARA). E.g., depends_on='orders' to filter KNA1 by customer IDs from the orders step."
                  },
                  "filter_field": {
                    "type": "string",
                    "description": "Key field to filter on from the parent step. E.g., 'KUNNR' to filter KNA1 by customer numbers from VBAK. Can also be an array like ['KUNNR'] for multiple fields."
                  },
                  "provides_key": {
                    "type": "string",
                    "description": "Key field this step provides for downstream steps"
                  },
                  "max_rows": {
                    "type": "integer",
                    "description": "Max rows for this step (minimum 1000 enforced)"
                  }
                },
                "required": [
                  "table",
                  "alias"
                ]
              }
            },
            "merge": {
              "type": "object",
              "description": "How to merge the results",
              "properties": {
                "on": {
                  "description": "Field(s) to join on (string or array)"
                },
                "how": {
                  "type": "string",
                  "enum": [
                    "inner",
                    "left",
                    "right",
                    "outer"
                  ],
                  "description": "Join type"
                },
                "groups": {
                  "type": "array",
                  "description": "For complex merges, define groups of tables to merge first",
                  "items": {
                    "type": "object",
                    "properties": {
                      "tables": {
                        "type": "array",
                        "items": {
                          "type": "string"
                        },
                        "description": "Table aliases to merge"
                      },
                      "on": {
                        "description": "Field(s) to join on"
                      },
                      "how": {
                        "type": "string",
                        "description": "Join type"
                      },
                      "result_alias": {
                        "type": "string",
                        "description": "Alias for merged result"
                      }
                    }
                  }
                }
              }
            },
            "aggregation": {
              "type": "object",
              "description": "Optional aggregation to apply after merge.",
              "properties": {
                "group_by": {
                  "description": "Field(s) to group by"
                },
                "sum_fields": {
                  "description": "Field(s) to sum"
                },
                "count": {
                  "type": "boolean",
                  "description": "Add a count column",
                  "default": false
                },
                "sort_by": {
                  "type": "string",
                  "description": "Field to sort by"
                },
                "sort_order": {
                  "type": "string",
                  "enum": [
                    "desc",
                    "asc"
                  ],
                  "description": "Sort order"
                },
                "limit": {
                  "type": "integer",
                  "description": "Number of rows to return"
                },
                "sign_field": {
                  "type": "string",
                  "description": "Field indicating debit/credit"
                },
                "sign_values": {
                  "type": "object",
                  "description": "Map of sign values to multipliers"
                },
                "include_fields": {
                  "description": "Additional fields to include"
                }
              }
            }
          },
          "required": [
            "steps"
          ]
        },
        "max_rows": {
          "type": "integer",
          "description": "Maximum rows in final result (minimum 1000 enforced)",
          "default": 10000
        },
        "confirmed": {
          "type": "boolean",
          "description": "Set to true after user confirms they want large results (>1000 rows)",
          "default": false
        },
        "sort_by": {
          "type": "string",
          "description": "Field to sort final results by (e.g., WADAT_IST, ERDAT, NETWR). Applied after merge."
        },
        "sort_order": {
          "type": "string",
          "enum": [
            "desc",
            "asc"
          ],
          "description": "Sort direction. Use 'desc' for most recent / highest first.",
          "default": "desc"
        },
        "limit": {
          "type": "integer",
          "description": "Return only this many rows after sorting. Use with sort_by for 'last N' / 'top N' queries."
        }
      },
      "required": [
        "query_plan"
      ]
    }
  },
  {
    "name": "sap_patch_code",
    "endpoint": "/patch_code",
    "description": "Forward a source-patching request to the configured /patch_code endpoint. The public Node connector does not retrieve source, apply replacements in Python or perform compatibility fixes itself. Read the current source before preparing replacements, then verify supported object types, patch arguments and validation behavior against the installed endpoint.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "object_type": {
          "type": "string",
          "enum": [
            "PROG",
            "INCL",
            "CLAS"
          ],
          "description": "Object type to patch"
        },
        "object_name": {
          "type": "string",
          "description": "Object name (e.g., Z_MY_REPORT, ZCL_MY_CLASS)"
        },
        "replacements": {
          "type": "array",
          "description": "List of search/replace operations to apply",
          "items": {
            "type": "object",
            "properties": {
              "old_text": {
                "type": "string",
                "description": "Exact text to find in the source (can be multi-line)"
              },
              "new_text": {
                "type": "string",
                "description": "Replacement text"
              }
            },
            "required": [
              "old_text",
              "new_text"
            ]
          }
        },
        "short_text": {
          "type": "string",
          "description": "Description (only used if object doesn't exist yet)"
        }
      },
      "required": [
        "object_type",
        "object_name",
        "replacements"
      ]
    }
  },
  {
    "name": "sap_read_change_docs",
    "endpoint": "/read_change_docs",
    "description": "Query change documents from CDHDR/CDPOS tables. Shows who changed what data and when. Use sap_discover_change_object first to find the correct OBJECTCLAS.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "object_class": {
          "type": "string",
          "description": "Change doc object class (e.g., KRED=Vendor, DEBI=Customer, SACH=G/L Account)",
          "example": "KRED"
        },
        "object_id": {
          "type": "string",
          "description": "Specific object ID to filter",
          "example": "0000001000"
        },
        "date_from": {
          "type": "string",
          "description": "Start date in YYYYMMDD format",
          "example": "20260101"
        },
        "date_to": {
          "type": "string",
          "description": "End date in YYYYMMDD format",
          "example": "20260131"
        },
        "user": {
          "type": "string",
          "description": "Filter by user who made changes",
          "example": "DEVELOPER1"
        },
        "max_rows": {
          "type": "integer",
          "description": "Maximum rows to return (server limit: 10000)",
          "default": 100,
          "example": 100
        },
        "include_fields": {
          "type": "boolean",
          "description": "Include field-level changes from CDPOS",
          "default": true
        }
      }
    }
  },
  {
    "name": "sap_read_change_docs_v2",
    "endpoint": "/read_change_docs_v2",
    "description": "Optimized change document query using function modules. Supports additional filtering by table name (TABNAME). Preferred over legacy endpoint.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "object_class": {
          "type": "string",
          "description": "Change doc object class (e.g., KRED=Vendor, DEBI=Customer, SACH=G/L Account)",
          "example": "KRED"
        },
        "object_id": {
          "type": "string",
          "description": "Specific object ID to filter",
          "example": "0000001000"
        },
        "date_from": {
          "type": "string",
          "description": "Start date in YYYYMMDD format",
          "example": "20260101"
        },
        "date_to": {
          "type": "string",
          "description": "End date in YYYYMMDD format",
          "example": "20260131"
        },
        "user": {
          "type": "string",
          "description": "Filter by user who made changes",
          "example": "DEVELOPER1"
        },
        "tabname": {
          "type": "string",
          "description": "Filter by table name (e.g., LFBK for vendor bank data)",
          "example": "LFBK"
        },
        "max_rows": {
          "type": "integer",
          "description": "Maximum rows to return (server limit: 10000)",
          "default": 100,
          "example": 100
        },
        "include_fields": {
          "type": "boolean",
          "description": "Include field-level changes from CDPOS",
          "default": true
        }
      }
    }
  },
  {
    "name": "sap_read_code",
    "endpoint": "/read_code",
    "description": "Retrieves the source code of an ABAP object (program, class, or function group). Optional `version` param ('ACTIVE' default, 'INACTIVE' for pending unactivated changes). When 'INACTIVE' is requested but no inactive version exists, returns the active version with `fallback_reason='no_inactive_version'`. The response includes a `version` field indicating which version was actually returned.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "object_type": {
          "type": "string",
          "enum": [
            "PROG",
            "CLAS",
            "FUGR"
          ],
          "description": "Type of ABAP object"
        },
        "object_name": {
          "type": "string",
          "description": "Name of the object (case-insensitive)",
          "example": "ZPROG_EXAMPLE"
        },
        "version": {
          "type": "string",
          "enum": [
            "ACTIVE",
            "INACTIVE"
          ],
          "default": "ACTIVE",
          "description": "Which source version to read. ACTIVE = last activated source (default). INACTIVE = pending unactivated changes (falls back to ACTIVE with fallback_reason='no_inactive_version' if not present)."
        }
      },
      "required": [
        "object_type",
        "object_name"
      ]
    }
  },
  {
    "name": "sap_read_domain_values",
    "endpoint": "/read_domain_values",
    "description": "Retrieves the fixed values defined for a domain. Useful for understanding valid values for fields like material type, document type, etc.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "domain_name": {
          "type": "string",
          "description": "Domain name",
          "example": "MTART"
        }
      },
      "required": [
        "domain_name"
      ]
    }
  },
  {
    "name": "sap_read_dump_details",
    "endpoint": "/read_dump_details",
    "description": "Get detailed information for a specific short dump including full error texts, cause, and solution. Use this after sap_read_dumps to drill into a specific dump. Pass date, time, user, server, and error_id directly from the sap_read_dumps results.",
    "inputSchema": {
      "type": "object",
      "required": [
        "date",
        "time",
        "user"
      ],
      "properties": {
        "date": {
          "type": "string",
          "description": "Dump date in YYYYMMDD format (from sap_read_dumps 'date' field)",
          "example": "20260208"
        },
        "time": {
          "type": "string",
          "description": "Dump time in HHMMSS format (from sap_read_dumps 'time' field)",
          "example": "103045"
        },
        "user": {
          "type": "string",
          "description": "User name who caused the dump (from sap_read_dumps 'user' field)",
          "example": "DEVELOPER1"
        },
        "server": {
          "type": "string",
          "description": "Application server (from sap_read_dumps 'server' field)",
          "example": "sapserver01"
        },
        "error_id": {
          "type": "string",
          "description": "Error ID / RABAX name (from sap_read_dumps 'error_id' field). Improves error text lookup.",
          "example": "MESSAGE_TYPE_X"
        },
        "langu": {
          "type": "string",
          "description": "Language for error texts (E=English, D=German). Defaults to system language.",
          "example": "E"
        }
      }
    }
  },
  {
    "name": "sap_read_dumps",
    "endpoint": "/read_dumps",
    "description": "Query ABAP runtime errors (short dumps) from SAP's ST22 transaction. Returns dump information including date, time, user, program, and error details.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "date_from": {
          "type": "string",
          "description": "Start date in YYYYMMDD format (default: today)",
          "example": "20260101"
        },
        "date_to": {
          "type": "string",
          "description": "End date in YYYYMMDD format (default: today)",
          "example": "20260131"
        },
        "user": {
          "type": "string",
          "description": "Filter by user name (optional)",
          "example": "DEVELOPER1"
        },
        "max_rows": {
          "type": "integer",
          "description": "Maximum rows to return",
          "default": 100,
          "example": 100
        }
      }
    }
  },
  {
    "name": "sap_read_dynpros",
    "endpoint": "/read_dynpros",
    "description": "Retrieves screen definitions for a program including field lists.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "object_type": {
          "type": "string",
          "enum": [
            "PROG",
            "CLAS",
            "FUGR"
          ],
          "description": "Type of ABAP object"
        },
        "object_name": {
          "type": "string",
          "description": "Name of the object (case-insensitive)",
          "example": "ZPROG_EXAMPLE"
        }
      },
      "required": [
        "object_type",
        "object_name"
      ]
    }
  },
  {
    "name": "sap_read_field_domain_values",
    "endpoint": "/read_field_domain_values",
    "description": "Get domain fixed values for a specific table field. Unlike /read_domain_values which requires the domain name, this finds the domain automatically from the field.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table_name": {
          "type": "string",
          "description": "SAP table name",
          "example": "EKKO"
        },
        "field_name": {
          "type": "string",
          "description": "Field name",
          "example": "BSART"
        }
      },
      "required": [
        "table_name",
        "field_name"
      ]
    }
  },
  {
    "name": "sap_read_foreign_keys",
    "endpoint": "/read_foreign_keys",
    "description": "Read foreign key relationships for a table from Data Dictionary (DD08L). Shows which tables are related and can be joined.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table_name": {
          "type": "string",
          "description": "Data Dictionary table name",
          "example": "MARA"
        }
      },
      "required": [
        "table_name"
      ]
    }
  },
  {
    "name": "sap_read_includes",
    "endpoint": "/read_includes",
    "description": "Retrieves all include files for a program with their source code.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "object_type": {
          "type": "string",
          "enum": [
            "PROG",
            "CLAS",
            "FUGR"
          ],
          "description": "Type of ABAP object"
        },
        "object_name": {
          "type": "string",
          "description": "Name of the object (case-insensitive)",
          "example": "ZPROG_EXAMPLE"
        }
      },
      "required": [
        "object_type",
        "object_name"
      ]
    }
  },
  {
    "name": "sap_read_jobs",
    "endpoint": "/read_jobs",
    "description": "Query background job information from SAP's SM37 transaction. Returns job status, execution times, and scheduling details.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "date_from": {
          "type": "string",
          "description": "Start date in YYYYMMDD format (default: last 7 days)",
          "example": "20260101"
        },
        "date_to": {
          "type": "string",
          "description": "End date in YYYYMMDD format (default: today)",
          "example": "20260131"
        },
        "job_name": {
          "type": "string",
          "description": "Filter by job name prefix",
          "example": "ZPROG_"
        },
        "user": {
          "type": "string",
          "description": "Filter by scheduling user",
          "example": "BATCH"
        },
        "status": {
          "type": "string",
          "enum": [
            "F",
            "A",
            "R",
            "S",
            "P"
          ],
          "description": "Job status: F=Finished, A=Aborted, R=Running, S=Scheduled, P=Ready"
        },
        "max_rows": {
          "type": "integer",
          "description": "Maximum rows to return",
          "default": 100,
          "example": 100
        }
      }
    }
  },
  {
    "name": "sap_read_object_details",
    "endpoint": "/read_object_details",
    "description": "Read comprehensive details about any SAP repository or DDIC object. Supports: DTEL (data elements), DOMA (domains with fixed values), TRAN (transactions \u2014 shows linked program), MSAG (message classes \u2014 all messages), TABL/STRU (table/structure fields), VIEW (database views), TTYP (table types), SHLP (search helps), ENQU (lock objects). For source code objects (PROG, CLAS, FUGR, FUNC), use sap_read_code instead. Returns structured data including descriptions, field definitions, relationships, and metadata.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "object_type": {
          "type": "string",
          "enum": [
            "DTEL",
            "DOMA",
            "TRAN",
            "MSAG",
            "TABL",
            "STRU",
            "VIEW",
            "TTYP",
            "SHLP",
            "ENQU"
          ],
          "description": "Type of object to read"
        },
        "object_name": {
          "type": "string",
          "description": "Object name (e.g., MATNR for data element, VA01 for transaction, 00 for message class)"
        }
      },
      "required": [
        "object_type",
        "object_name"
      ]
    }
  },
  {
    "name": "sap_read_object_info",
    "endpoint": "/read_object_info",
    "description": "Get metadata about an ABAP object including creation date, last changed date, author, and package.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "object_type": {
          "type": "string",
          "enum": [
            "PROG",
            "CLAS",
            "FUGR"
          ],
          "description": "Type of ABAP object"
        },
        "object_name": {
          "type": "string",
          "description": "Name of the object (case-insensitive)",
          "example": "ZPROG_EXAMPLE"
        }
      },
      "required": [
        "object_type",
        "object_name"
      ]
    }
  },
  {
    "name": "sap_read_syslog",
    "endpoint": "/read_syslog",
    "description": "Query system log entries from SAP's SM21 transaction. Shows system events, warnings, and errors.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "date_from": {
          "type": "string",
          "description": "Start date in YYYYMMDD format (default: today)",
          "example": "20260101"
        },
        "date_to": {
          "type": "string",
          "description": "End date in YYYYMMDD format (default: today)",
          "example": "20260131"
        },
        "user": {
          "type": "string",
          "description": "Filter by user",
          "example": "DEVELOPER1"
        },
        "tcode": {
          "type": "string",
          "description": "Filter by transaction code",
          "example": "SE38"
        },
        "max_rows": {
          "type": "integer",
          "description": "Maximum rows to return",
          "default": 100,
          "example": 100
        }
      }
    }
  },
  {
    "name": "sap_read_table_data",
    "endpoint": "/read_table_data",
    "description": "Reads actual data from a SAP table with optional WHERE clause filtering and metadata inclusion. Use this for small to medium datasets (up to a few thousand rows).\n\nIMPORTANT: If the query returns more than 1000 rows, you will receive a 'requires_confirmation' response with a preview. You MUST ask the user if they want to see all the data before calling again with confirmed=true.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table_name": {
          "type": "string",
          "description": "Table to read",
          "example": "MARA"
        },
        "max_rows": {
          "type": "integer",
          "description": "Maximum rows to return (default: 10000)",
          "default": 10000,
          "example": 10000
        },
        "include_metadata": {
          "type": "boolean",
          "description": "Include field structure metadata",
          "default": true,
          "example": true
        },
        "where_clause": {
          "type": "string",
          "description": "SQL WHERE condition for filtering",
          "example": "MTART = 'FERT' AND ERSDA >= '20230101'"
        },
        "confirmed": {
          "type": "boolean",
          "description": "Set to true after user confirms they want large results (>1000 rows)",
          "default": false
        },
        "field_list": {
          "type": "string",
          "description": "Comma-separated field names to return (optional, defaults to all fields)"
        }
      },
      "required": [
        "table_name"
      ]
    }
  },
  {
    "name": "sap_read_table_data_enhanced",
    "endpoint": "/read_table_data_enhanced",
    "description": "Query data from an SAP table with optional WHERE clause filtering. Use this to retrieve business data like materials (MARA), purchase orders (EKKO), sales orders (VBAK), vendors (LFA1), customers (KNA1), etc. Supports ABAP WHERE clause syntax for filtering. For audit/compliance queries requiring ALL records, set audit_mode=true. Fields in WHERE clause and field_list are validated against table structure. Use sap_get_field_metadata or sap_read_table_structure first to discover correct field names.",
    "inputSchema": {
      "type": "object",
      "properties": {}
    }
  },
  {
    "name": "sap_read_table_paginated",
    "endpoint": "/read_table_paginated",
    "description": "Read table data with pagination support for large result sets. Use offset and limit to page through results. Recommended for tables with 500-5000 rows. For larger tables, consider streaming. Fields in WHERE clause and field_list are validated against table structure. Use sap_get_field_metadata or sap_read_table_structure first to discover correct field names.",
    "inputSchema": {
      "type": "object",
      "properties": {}
    }
  },
  {
    "name": "sap_read_table_structure",
    "endpoint": "/read_table_structure",
    "description": "Retrieves the metadata of a Data Dictionary table including field definitions, data types, keys, and descriptions.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table_name": {
          "type": "string",
          "description": "Data Dictionary table name",
          "example": "MARA"
        }
      },
      "required": [
        "table_name"
      ]
    }
  },
  {
    "name": "sap_read_texts",
    "endpoint": "/read_texts",
    "description": "Retrieves text elements (selection texts, text symbols) for a program.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "object_type": {
          "type": "string",
          "enum": [
            "PROG",
            "CLAS",
            "FUGR"
          ],
          "description": "Type of ABAP object"
        },
        "object_name": {
          "type": "string",
          "description": "Name of the object (case-insensitive)",
          "example": "ZPROG_EXAMPLE"
        }
      },
      "required": [
        "object_type",
        "object_name"
      ]
    }
  },
  {
    "name": "sap_read_translations",
    "endpoint": "/read_translations",
    "description": "Reads translatable texts from a SAP object in source and optionally target language. Equivalent to SE63 in SAP GUI. Supports: PROG (text pool), DTEL (data element), DOMA (domain values), MSAG (message class), TABL (table/field texts), FUNC (function module), CLAS (class description + method/component descriptions + class text pool), CUAD (GUI status: function texts, titles, menus), DYNP (dynpro screens: screen titles, custom field texts, frame titles). Returns text IDs, source texts, existing target translations, and max lengths.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "object_type": {
          "type": "string",
          "enum": [
            "PROG",
            "DTEL",
            "DOMA",
            "MSAG",
            "TABL",
            "FUNC",
            "CLAS",
            "CUAD",
            "DYNP"
          ],
          "description": "Type of SAP object. PROG=Program text pool, DTEL=Data element, DOMA=Domain fixed values, MSAG=Message class, TABL=Table/field descriptions, FUNC=Function module, CLAS=Class (description + method descriptions + text pool), CUAD=GUI status (function texts, titles, menus), DYNP=Dynpro screens (screen titles, custom field/frame texts)"
        },
        "object_name": {
          "type": "string",
          "description": "Name of the SAP object (e.g., ZPROG_EXAMPLE, MATNR, MTART, Z_MY_MSG)",
          "maxLength": 40
        },
        "source_language": {
          "type": "string",
          "description": "SAP 1-char language code for source texts. E=English, D=German, S=Spanish, F=French, I=Italian, J=Japanese, P=Portuguese, K=Korean, 1=Chinese. Default: E",
          "default": "E",
          "maxLength": 1
        },
        "target_language": {
          "type": "string",
          "description": "SAP 1-char language code for target texts (optional). If provided, also reads existing translations in the target language.",
          "maxLength": 1
        }
      },
      "required": [
        "object_type",
        "object_name"
      ]
    }
  },
  {
    "name": "sap_read_user_locks",
    "endpoint": "/read_user_locks",
    "description": "Query user lock status from USR02 table. Shows which users are locked and their last login information.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "user": {
          "type": "string",
          "description": "Filter by user name prefix",
          "example": "DEV"
        },
        "locked_only": {
          "type": "boolean",
          "description": "Only return locked users",
          "default": false
        },
        "max_rows": {
          "type": "integer",
          "description": "Maximum rows to return",
          "default": 100,
          "example": 100
        }
      }
    }
  },
  {
    "name": "sap_read_where_used",
    "endpoint": "/read_where_used",
    "description": "Queries SAP's cross-reference tables (WBCROSSGT/WBCROSSI) to find what objects use a given object (forward) or what a given object uses (inverse). Equivalent to SAP's 'Where-Used List' functionality. IMPORTANT: For heavily-used tables (MARA, KNA1, LFA1), use name_filter='Z*' to avoid timeout!",
    "inputSchema": {
      "type": "object",
      "properties": {
        "object_name": {
          "type": "string",
          "description": "Name of the object to look up (e.g., MARA, BAPI_PO_CREATE, ZCL_MY_CLASS)",
          "example": "MARA"
        },
        "object_type": {
          "type": "string",
          "enum": [
            "TABL",
            "VIEW",
            "DTEL",
            "DOMA",
            "STRU",
            "PROG",
            "INCL",
            "FUNC",
            "CLAS",
            "FUGR"
          ],
          "description": "Type of the object",
          "default": "TABL",
          "example": "TABL"
        },
        "direction": {
          "type": "string",
          "enum": [
            "forward",
            "inverse"
          ],
          "description": "Query direction: 'forward' finds what uses this object, 'inverse' finds what this object uses",
          "default": "forward",
          "example": "forward"
        },
        "max_results": {
          "type": "integer",
          "description": "Maximum number of results to return (max: 1000)",
          "default": 100,
          "minimum": 1,
          "maximum": 1000,
          "example": 100
        },
        "name_filter": {
          "type": "string",
          "description": "Filter pattern for object names (e.g., 'Z*' for custom objects, 'Y*' for Y namespace). Supports * as wildcard. REQUIRED for heavily-used tables like MARA to avoid timeout!",
          "example": "Z*"
        }
      },
      "required": [
        "object_name"
      ]
    }
  },
  {
    "name": "sap_run_program",
    "endpoint": "/run_program",
    "description": "Request execution of an ABAP report through the configured /run_program endpoint. Report name is required; variant-based selection and returned output depend on the installed backend. The public Node connector does not implement a 180-second timeout, background-job fallback or polling workflow. Agree the report and execution scope before use.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "report": {
          "type": "string",
          "description": "ABAP program name to execute (e.g., Z_PO_SUMMARIZER). Will be uppercased."
        },
        "variant": {
          "type": "string",
          "description": "Selection screen variant name (optional)."
        },
        "max_output_lines": {
          "type": "integer",
          "default": 500,
          "description": "Maximum output lines to return (default: 500)"
        }
      },
      "required": [
        "report"
      ]
    }
  },
  {
    "name": "sap_run_transaction",
    "endpoint": "/run_transaction",
    "description": "Run the ABAP report behind a report transaction code, optionally with a selection-screen variant, and return its list output. Resolves the transaction to its program via TSTC, then runs it like sap_run_program (extended timeout with background-job fallback). Parameter 'tcode' (required) is the transaction code. Parameter 'variant' (optional) is a selection-screen variant (create it with sap_save_variant for programs with mandatory fields). LIMITATION: only report transactions (TSTC-PGMNA set) can run headlessly; pure dialog transactions are not supported.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "tcode": {
          "type": "string",
          "description": "Transaction code (e.g. SE16, ZXYZ). Will be uppercased."
        },
        "variant": {
          "type": "string",
          "description": "Selection screen variant name (optional)."
        },
        "max_output_lines": {
          "type": "integer",
          "default": 500,
          "description": "Maximum output lines to return (default: 500)"
        }
      },
      "required": [
        "tcode"
      ]
    }
  },
  {
    "name": "sap_save_variant",
    "endpoint": "/save_variant",
    "description": "Create or overwrite an ABAP selection-screen VARIANT for a report, so it can be reused by sap_run_program (and the performance trace / headless runs) for programs whose selection screen has mandatory fields. Parameter 'report' (required) is the program name. Parameter 'variant' (required) is the variant name (<=14 chars). Parameter 'text' (optional) is a description. Parameter 'environment' (optional, default 'A') is 'A' online or 'B' batch. Parameter 'parameters' (required) is the selection values as a list of objects with keys: selname, kind ('P' parameter / 'S' select-option), sign ('I'/'E'), option ('EQ','BT','CP',...), low, high. To read a variant back use sap_call_function RS_VARIANT_CONTENTS_RFC (REPORT, VARIANT); to delete use RS_VARIANT_DELETE_RFC (REPORT, VARIANT).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "report": {
          "type": "string",
          "description": "ABAP report/program name. Will be uppercased."
        },
        "variant": {
          "type": "string",
          "description": "Variant name, max 14 chars. Will be uppercased."
        },
        "text": {
          "type": "string",
          "description": "Variant description (optional)."
        },
        "environment": {
          "type": "string",
          "description": "Variant environment: 'A' (online, default) or 'B' (batch)."
        },
        "parameters": {
          "type": "array",
          "description": "Selection values (RSPARAMS rows).",
          "items": {
            "type": "object",
            "properties": {
              "selname": {
                "type": "string",
                "description": "Selection field name (e.g. S_WERKS, P_TEST)"
              },
              "kind": {
                "type": "string",
                "description": "'P' parameter or 'S' select-option"
              },
              "sign": {
                "type": "string",
                "description": "'I' include or 'E' exclude (select-options)"
              },
              "option": {
                "type": "string",
                "description": "EQ, NE, GE, GT, LE, LT, BT, NB, CP, NP"
              },
              "low": {
                "type": "string",
                "description": "Value (or low bound for BT)"
              },
              "high": {
                "type": "string",
                "description": "High bound for BT/NB (optional)"
              }
            },
            "required": [
              "selname"
            ]
          }
        }
      },
      "required": [
        "report",
        "variant",
        "parameters"
      ]
    }
  },
  {
    "name": "sap_scan_security_notes",
    "endpoint": "/scan_security_notes",
    "description": "Discover ABAP Security/HotNews notes for a SAP patch-day month and rank them by relevancy to this system. Fetches the public SAP Focused Run CSA note policy (github.com/SAP-samples/frun-csa-policies-best-practices), compares each note's fixed-in support-package levels against the system's installed components (CVERS), and classifies the affected ones via /classify_note_v2. min_priority=1 for HotNews only (1=HotNews .. 4=Low; includes priorities <= the given value). month defaults to the latest published patch day.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "month": {
          "type": "string",
          "pattern": "^\\d{4}-\\d{2}$",
          "description": "Patch-day month as YYYY-MM (e.g., 2026-06). Default: latest published."
        },
        "min_priority": {
          "type": "integer",
          "minimum": 1,
          "maximum": 4,
          "description": "Include notes with priority <= this value. 1=HotNews only, 4=all (default).",
          "default": 4
        },
        "classify": {
          "type": "boolean",
          "description": "Classify affected notes via classify_note_v2 (implementation state on this system). Default true.",
          "default": true
        }
      }
    }
  },
  {
    "name": "sap_search_knowledge",
    "endpoint": "/search_knowledge",
    "description": "Search SAP documentation and community for information on any SAP topic. Queries SAP Help Portal and web sources (community.sap.com, StackOverflow, blogs.sap.com). Use this to research SAP concepts, find best practices, or look up configuration guides. Unlike sap_lookup_error, this is for general knowledge queries, not specific error messages.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Search query. Examples: 'SAP BAPI_SALESORDER_CREATEFROMDAT2 usage', 'CDS view with currency conversion', 'MRP configuration best practices'"
        },
        "max_results": {
          "type": "integer",
          "description": "Maximum results per source (default: 5)",
          "default": 5,
          "minimum": 1,
          "maximum": 10
        }
      },
      "required": [
        "query"
      ]
    }
  },
  {
    "name": "sap_search_tables",
    "endpoint": "/search_tables",
    "description": "Search the Data Dictionary for tables matching a keyword. Returns table names and descriptions.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "keyword": {
          "type": "string",
          "description": "Search keyword",
          "example": "MATERIAL"
        },
        "max_results": {
          "type": "integer",
          "description": "Maximum results to return",
          "default": 20,
          "example": 20
        }
      },
      "required": [
        "keyword"
      ]
    }
  },
  {
    "name": "sap_smart_table_query",
    "endpoint": "/smart_table_query",
    "description": "Execute a table query with automatic metadata-driven enhancements. This tool: 1. Fetches table metadata and classifies fields 2. Adds recommendations for currency filtering, status exclusion 3. Warns if you're using the wrong customer field 4. Executes the query with proper field validation Use this instead of sap_read_table_data when you want intelligent guidance!",
    "inputSchema": {
      "type": "object",
      "properties": {}
    }
  },
  {
    "name": "sap_stream_table_data",
    "endpoint": "/stream_table_data",
    "description": "Streams large table data using offset-based pagination. Call repeatedly with increasing offset to retrieve all data. Ideal for tables with millions of rows.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table_name": {
          "type": "string",
          "description": "Table to stream",
          "example": "MSEG"
        },
        "package_size": {
          "type": "integer",
          "description": "Rows per chunk (recommended max: 10000)",
          "default": 1000,
          "example": 5000
        },
        "offset": {
          "type": "integer",
          "description": "Starting row offset",
          "default": 0,
          "example": 0
        }
      },
      "required": [
        "table_name"
      ]
    }
  },
  {
    "name": "sap_syntax_check",
    "endpoint": "/syntax_check",
    "description": "Validates ABAP source code for syntax errors without creating or activating it.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "source": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Source code lines to check"
        },
        "program_name": {
          "type": "string",
          "description": "Context program name (optional)",
          "example": "ZPROG_TEST"
        }
      },
      "required": [
        "source"
      ]
    }
  },
  {
    "name": "sap_translate",
    "endpoint": "/translate",
    "description": "Composite tool: reads translatable texts from a SAP object, translates them using AI, and optionally writes them back. Workflow: 1) Read source texts  2) AI translate with SAP terminology  3) Return translations for review (or auto-deploy if auto_deploy=true). Preserves SAP placeholders (&1, &2, etc.) and respects max_length constraints. Supports: PROG, DTEL, DOMA, MSAG, TABL, FUNC, CLAS, CUAD, DYNP.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "object_type": {
          "type": "string",
          "enum": [
            "PROG",
            "DTEL",
            "DOMA",
            "MSAG",
            "TABL",
            "FUNC",
            "CLAS",
            "CUAD",
            "DYNP"
          ],
          "description": "Type of SAP object"
        },
        "object_name": {
          "type": "string",
          "description": "Name of the SAP object",
          "maxLength": 40
        },
        "source_language": {
          "type": "string",
          "description": "SAP 1-char source language code (default: E=English)",
          "default": "E",
          "maxLength": 1
        },
        "target_language": {
          "type": "string",
          "description": "SAP 1-char target language code (e.g., S=Spanish, D=German)",
          "maxLength": 1
        },
        "auto_deploy": {
          "type": "boolean",
          "description": "If true, automatically write translations to SAP after AI translation. If false (default), return translations for review first.",
          "default": false
        }
      },
      "required": [
        "object_type",
        "object_name",
        "target_language"
      ]
    }
  },
  {
    "name": "sap_write_code",
    "endpoint": "/write_code",
    "description": "Forward an ABAP source-write request to the configured /write_code endpoint. This connector does not redirect class writes, apply compatibility fixes, run a separate syntax check or activate objects itself. Confirm supported object types, authorization, validation and activation behavior on the installed backend before allowing writes.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "object_type": {
          "type": "string",
          "enum": [
            "PROG",
            "INCL",
            "FUGR",
            "FUNC",
            "CLAS"
          ],
          "description": "Type of object to create"
        },
        "object_name": {
          "type": "string",
          "description": "Name for the object",
          "example": "ZPROG_NEW"
        },
        "source": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Source code lines"
        },
        "short_text": {
          "type": "string",
          "description": "Description text",
          "example": "My New Program"
        },
        "fugr_name": {
          "type": "string",
          "description": "Function group name (required for FUNC type)",
          "example": "ZFUGR_TEST"
        },
        "package": {
          "type": "string",
          "description": "Development package for CLAS (defaults to $TMP)",
          "default": "$TMP"
        },
        "transport": {
          "type": "string",
          "description": "Transport request for CLAS (required if package != $TMP)"
        }
      },
      "required": [
        "object_type",
        "object_name",
        "source"
      ]
    }
  },
  {
    "name": "sap_write_code_safe",
    "endpoint": "/write_code_safe",
    "description": "Forward a request to the configured /write_code_safe endpoint. Validation, compatibility fixes, retries and deployment behavior depend on that installed endpoint; the tool name does not establish those safeguards. The public Node connector does not implement the Python bridge workflow, provide an abap://syntax-rules resource or route writes through ADT itself. Verify the backend contract and required arguments before use; the current input schema is incomplete.",
    "inputSchema": {
      "type": "object",
      "properties": {}
    }
  },
  {
    "name": "sap_write_translations",
    "endpoint": "/write_translations",
    "description": "Writes translated texts back to a SAP object. Equivalent to saving translations in SE63. Provide an array of translations with text_id (from sap_read_translations) and the translated_text. Supports: PROG, DTEL, DOMA, MSAG, TABL, FUNC, CLAS, CUAD, DYNP.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "object_type": {
          "type": "string",
          "enum": [
            "PROG",
            "DTEL",
            "DOMA",
            "MSAG",
            "TABL",
            "FUNC",
            "CLAS",
            "CUAD",
            "DYNP"
          ],
          "description": "Type of SAP object"
        },
        "object_name": {
          "type": "string",
          "description": "Name of the SAP object",
          "maxLength": 40
        },
        "target_language": {
          "type": "string",
          "description": "SAP 1-char language code for the target language. E=English, D=German, S=Spanish, F=French, etc.",
          "maxLength": 1
        },
        "translations": {
          "type": "array",
          "description": "Array of translations to write",
          "items": {
            "type": "object",
            "properties": {
              "text_id": {
                "type": "string",
                "description": "Text identifier from sap_read_translations"
              },
              "translated_text": {
                "type": "string",
                "description": "The translated text"
              }
            },
            "required": [
              "text_id",
              "translated_text"
            ]
          }
        }
      },
      "required": [
        "object_type",
        "object_name",
        "target_language",
        "translations"
      ]
    }
  }
];

const CATALOG = cfg.allowlist.length
  ? TOOLS.filter((t) => cfg.allowlist.includes(t.name))
  : TOOLS;

const BY_NAME = new Map(CATALOG.map((t) => [t.name, t]));

const server = new Server(
  { name: "abapilot", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: CATALOG.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = BY_NAME.get(request.params.name);
  if (!tool) {
    return {
      isError: true,
      content: [
        { type: "text", text: `Unknown tool: ${request.params.name}` },
      ],
    };
  }
  const r = await sapRequest(tool.endpoint, normalize(request.params.arguments));
  if (!r.ok) {
    return {
      isError: true,
      content: [{ type: "text", text: r.error ?? "Unknown error" }],
    };
  }
  const body =
    typeof r.data === "string" ? r.data : JSON.stringify(r.data, null, 2);
  return { content: [{ type: "text", text: body }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(
  `ABAPilot MCP connector ${VERSION} connected \u2014 ${CATALOG.length} tools \u2014 ` +
    `backend: ${cfg.url || "(not configured)"}`,
);
