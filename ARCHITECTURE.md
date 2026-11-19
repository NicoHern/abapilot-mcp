# ABAPilot architecture

ABAPilot puts AI clients in front of SAP without giving them a way around SAP. The logic and the security live in ABAP, inside your system. The MCP connector in this repository only translates between the AI client and that backend.

## Request flow

```text
AI client (Claude, Copilot, Codex, Cursor, Copilot Studio …)
        │  MCP (stdio)
        ▼
ABAPilot MCP connector  ── npx -y abapilot, on the developer's machine
        │                  or a central server (Docker / Linux service)
        │  HTTPS, JSON, the user's own SAP credentials or token
        ▼
SAP ICF service /sap/bc/abapilot          ── your SAP system
        ▼
Dispatcher
  1. endpoint registry      /ABAPILOT/CONFIG   (is this endpoint active here?)
  2. capability check       ZABPLT_EP          (may this user use this group?)
  3. hard guards            productive client, admin tables, blocklists
        ▼
Handler class
  4. standard SAP checks    VIEW_AUTHORITY_CHECK, S_DEVELOP …
  5. ABAP logic             reads, syntax check, write + activation …
        ▼
Audit log                   /ABAPILOT/AUDIT    (every call, denials included)
```

Nothing runs as a shared technical user. `SY-UNAME` in SAP is the person using the AI, so SAP's authorizations, change documents and transport ownership stay personal.

## Components

| Component | Where it runs | Notes |
| --- | --- | --- |
| ABAPilot backend | Your SAP system, namespace `/ABAPILOT/` | Imported as one transport. Written in ABAP 7.00-compatible syntax, so the same code runs on ECC 6.0 and S/4HANA. |
| MCP connector | Developer machine or a central host | This repository. Stateless. Holds no SAP data. |
| AI model | Your choice | Bring your own model and key: Anthropic, OpenAI, Azure OpenAI, Google, AWS Bedrock, or a local model. ABAPilot does not host or resell model access. |

## Authorization in detail

**Endpoint registry.** `/ABAPILOT/CONFIG` maps each URL path to a handler class and method, with an active flag. An endpoint that is not registered, or not active, does not exist for any client. Write endpoints are delivered inactive; the customer's administrator activates the ones they need.

**Capability groups and `ZABPLT_EP`.** Each endpoint belongs to a capability group (for example read data, read code, write code, administration) with an activity. The authorization object `ZABPLT_EP` (fields `ZABPLT_GRP`, `ACTVT`) is checked for the calling user. An endpoint without a group mapping is denied. Template roles and SU24 proposals are delivered; administration is done in an SAP GUI transaction.

The engine has three modes, set by your administrator:

| Mode | Behaviour |
| --- | --- |
| `SHADOW` | Decides and logs every request, but does not block. Use it while designing roles; you can enforce selected pilot users already. |
| `ENFORCE` | A denial returns HTTP 403 and the handler does not run. If the engine itself fails, the request is denied (fail-closed, default). |
| `OFF` | No capability check. Standard SAP checks in the handlers still apply. |

**Standard SAP checks in the handlers.**

- Table and view reads call `VIEW_AUTHORITY_CHECK`: authorization groups (S_TABU_DIS), table names (S_TABU_NAM) and organizational criteria at row level.
- Source code reads require S_DEVELOP display (03) on the object. Writes require S_DEVELOP change (02); deletions require 06.

**Hard guards.** Repository changes are refused in a client whose T000 role is productive, unless an administrator explicitly allows them. ABAPilot's own tables are restricted to ABAPilot administrators. Configurable table blocklists and a function-module denylist apply to every user.

**Client-side tool filter.** `ABAPILOT_TOOLS` limits which tools a given client shows to the model. It keeps prompts lean; it is not an access control. Access is decided in SAP by the layers above.

## Data handling

SAP data returned to the AI client is sent to the model provider you configure, under your contract with that provider. To keep data in your tenant, use a model in your own cloud account (for example Azure OpenAI or AWS Bedrock) or a local model. The npm connector stores no SAP data; the audit log stays in SAP.

Use HTTPS between connector and SAP. `ABAPILOT_TLS_INSECURE=1` exists for development systems with self-signed certificates only.

## Deployment options

- **Local, per developer.** Each developer runs the connector with their own SAP user. Simplest start; typical for trials.
- **Central.** One connector host (Docker or Linux service) for the team, with each user signing in individually (Microsoft Entra ID, tokens kept in Azure Key Vault or equivalent). The audit log still shows the individual user.

Both work on ECC 6.0, S/4HANA on-premise and S/4HANA Cloud Private Edition (RISE). See the [README](https://github.com/NicoHern/abapilot-mcp/blob/main/README.md#sap-s4hana-cloud-private-edition-rise) for RISE specifics.

## Open-source foundation

The dispatcher pattern, a table-driven registry of REST endpoints, is published as [ABAP Dynamic REST](https://github.com/NicoHern/abap-dynamic-rest) (MIT), so your team can inspect how paths map to handlers. The commercial backend adds the handlers, the authorization layer, the audit log and the administration tools.

## Verified installations

Checks run on 9 September 2026 against four existing installations through their configured MCP integrations. Labels are anonymous; no customer data, credentials or source code are published.

| Installation | SAP_BASIS release / SP | Application component / SP | Result |
| --- | --- | --- | --- |
| ECC A | 750 / 0009 | SAP_APPL 618 / 0008 | All five checks passed |
| ECC B | 700 / 0013 | SAP_APPL 603 / 0000 | All five checks passed |
| S/4 A | 758 / 0001 | S4CORE 108 / 0001 | All five checks passed |
| S/4 B | 757 / 0007 | S4CORE 107 / 0002 | All five checks passed |

The five checks:

1. Read the CVERS dictionary structure.
2. Read the installed component versions (SAP_BASIS, SAP_APPL, S4CORE).
3. Read the active dispatcher source.
4. Syntax-check a valid probe: no errors reported.
5. Syntax-check a deliberately invalid probe: error reported at the expected line.

This scope covers connectivity, dictionary and code reads, and syntax checking across ECC and S/4HANA releases. Writes, activation and testing are shown end to end in the [recorded code-change workflow](https://youtu.be/-AZBPH3gAkw) (14 ABAP Unit tests passing). In a trial we repeat these checks on your system and release, and validate the specific workflows you plan to use.

[Book a live evaluation](https://crimsonconsultingsl.com/demo/) · [IDE setup guide](https://crimsonconsultingsl.com/abapilot-abap-mcp-server-any-ide/)
