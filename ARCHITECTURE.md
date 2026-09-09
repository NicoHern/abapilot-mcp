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
