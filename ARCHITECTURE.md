# ABAPilot architecture and deployment boundaries

ABAPilot connects MCP-capable AI clients to a licensed SAP-side backend. This page distinguishes the public npm connector from deployment-specific backend behavior. Review the installed versions and enabled operations before a trial.

## Public connector request flow

```text
MCP-capable AI client
        | MCP over standard input/output
        v
Public abapilot npm connector (external Node.js process)
        | HTTP POST, JSON payload
        | Use an HTTPS backend URL for deployment
        v
Configured ABAPilot backend URL + tool endpoint path
        v
Licensed SAP-side implementation and configured permissions
```

The public connector reads its backend URL and credentials from environment variables. It sends a bearer token when configured, otherwise Basic authentication when a user is configured. The connector does not provision SAP users, install the backend or establish that an endpoint enforces a particular authorization object.

The connector normalizes selected identifier fields and forwards tool arguments as JSON. It does not itself run the separate Python bridge's validation, classification or multi-step workflow implementations. A tool description is not proof that those behaviors exist on a deployed HTTP endpoint.

## Inspect the public REST framework

[ABAP Dynamic REST](https://github.com/NicoHern/abap-dynamic-rest) is a separate MIT-licensed repository documenting the table-driven REST framework identified in its README as an ABAP foundation of ABAPilot. It includes installation instructions, an endpoint registry, a dispatcher and sample handlers. Readers can inspect how endpoint paths map to handler classes and methods, and review the documented security considerations.

Keep the components distinct: the public REST framework, the public npm MCP connector and the full licensed ABAPilot backend have different scopes. Publishing the framework does not establish that it contains every commercial endpoint or reproduces the recorded demonstration. Confirm the branch, commit, SAP release and required handlers when evaluating it. Compatibility and security claims require installation-specific evidence.

## Catalog and operation availability

The published npm connector 1.0.5 exposes 49 tool definitions by default. `ABAPILOT_TOOLS` can narrow the catalog presented to a client. This client-side filter is not a substitute for server-side authorization.

The connector starts without a backend URL so directories and clients can inspect its catalog. Calls in that state return setup instructions. Listing a tool does not demonstrate that its corresponding backend operation is installed, enabled or functional.

The SAP-side endpoint registry may use `/ABAPILOT/CONFIG` or `/TSRA/CONFIG`, depending on the installation. Confirm the registry, endpoint paths, active settings and permissions on the deployed version. Some public definitions have incomplete input schemas; validate the required arguments and behavior against the installed backend before relying on them.

## Security and data handling

Use an HTTPS backend URL and review credential handling in the selected MCP client. The connector supports a development-only TLS verification override; keep certificate verification enabled in deployed environments.

Confirm the effective SAP identity, operation-specific authorization checks, permitted data scope and audit records in your installation. Do not infer equivalence with SAP GUI permissions, a read-only default or complete audit coverage from this architecture diagram.

The catalog includes both validated and low-level write operations. Verify syntax checking, activation behavior and failure handling for each permitted write path. The npm connector itself does not supply a universal write-validation gate.

SAP context returned to the AI client may be sent to its model provider. Review the client's routing, provider terms, retention settings and enabled features. Using your own API key or selecting a local model alone does not establish the data handling of the entire workflow.

## Deployment and evidence

Agree the SAP release, backend version, service URL, network access, credentials, enabled endpoints and client configuration with the SAP team. Verify client-specific MCP support and required capabilities. Installation effort and supported operations depend on that environment; there is no universal setup-time or SAP-release guarantee.

The [recorded code-change walkthrough](https://youtu.be/-AZBPH3gAkw) demonstrates one configured sandbox workflow using Claude Code, ABAPilot and a lifecycle skill. Its final ABAP Unit run passed 14 test methods. It does not establish that the public npm connector reproduces every operation in that workflow.

Read the [technical case and coverage limits](https://crimsonconsultingsl.com/ai-for-abap-development/#abap-change-tests-documentation), follow the [IDE setup guide](https://crimsonconsultingsl.com/abapilot-abap-mcp-server-any-ide/), or [book a live evaluation](https://crimsonconsultingsl.com/demo/).

## Four-installation operational checks — 9 September 2026

We checked four existing SAP connections using their configured MCP integrations. All four successfully returned dictionary metadata, installed component rows and active dispatcher source. Each accepted a valid syntax-only probe and rejected a deliberately invalid probe at the expected line. Installation labels below are anonymous; no customer identity, credentials, business records or SAP source code are published here.

| Installation | SAP_BASIS release / SP | Application component / SP | Result |
| --- | --- | --- | --- |
| ECC A | 750 / 0009 | SAP_APPL 618 / 0008 | All five checks passed |
| ECC B | 700 / 0013 | SAP_APPL 603 / 0000 | All five checks passed |
| S/4 A | 758 / 0001 | S4CORE 108 / 0001 | All five checks passed |
| S/4 B | 757 / 0007 | S4CORE 107 / 0002 | All five checks passed |

### Method and observed responses

1. Read the CVERS dictionary structure before requesting its COMPONENT, RELEASE and EXTRELEASE fields.
2. Read those installed-component fields for SAP_BASIS, SAP_APPL and S4CORE. The dedicated system-info endpoint was unavailable on the two ECC connections; direct CVERS reads succeeded.
3. Read the active dispatcher source. Two installations used a namespaced dispatcher; two used the original dispatcher name. No deployed-source comparison with the public framework commit was performed.
4. Submit a syntax-only probe declaring an integer variable and assigning the value 1. All four responses reported no syntax errors.
5. Submit a corresponding negative probe with the assignment expression omitted. All four reported a syntax error at line 3. No probe was saved or activated.

### What this evidence covers

These are first-party, dated operational checks of existing installations. They establish the listed reads and syntax-check behavior on those component versions. They do not establish that npm connector 1.0.5 was used on every connection, that the unchanged public REST framework commit was installed, or that every advertised endpoint works. They are separate from the recorded 14-test ABAP Unit demonstration linked above.

No SAP writes, activation, transport changes, unit-test execution, authorization-denial tests or fresh installations were part of this check. Coverage of other enhancement packages, releases and full workflows remains to be validated. For a trial, repeat these checks through the intended client and connector, record backend and connector revisions, then validate the specific authorized workflow.
