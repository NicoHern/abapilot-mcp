# ABAPilot Architecture

A conceptual overview of how ABAPilot connects AI clients to SAP systems. This describes the design, not the implementation — for a live walkthrough against your own system, [request a demo](https://crimsonconsultingsl.com/contact-crimson-consulting/).

## Design principles

1. **The SAP system stays the authority.** ABAPilot never re-implements security: every request executes under the calling SAP user's own authorization profile. If SAPGUI would deny it, ABAPilot denies it.
2. **Exposure is explicit, never implicit.** Nothing is reachable unless registered in the whitelist. The default surface area is zero.
3. **No new infrastructure inside SAP.** Standard ABAP objects, one ICF service node, delivered as a normal transport. No kernel changes, no Gateway, no BTP, no ADT dependency — which is why it runs on ECC 6.0 as comfortably as on current S/4HANA.
4. **The model is a configuration choice.** Cloud (Claude, OpenAI, Gemini, Bedrock via your own keys) or fully local (Ollama). Data residency follows your choice, not ours.

## Request flow

```
AI client (Claude / Claude Code / Cursor / ChatGPT)
        |  Model Context Protocol
        v
ABAPilot MCP Server        (local process or Docker, on your network)
        |  HTTPS — single SICF endpoint
        v
+---------------- SAP system ----------------+
|  ICF handler (dynamic dispatch)            |
|      |                                     |
|      +--> /ABAPILOT/CONFIG  (whitelist:    |
|      |     is this endpoint registered?)   |
|      +--> SAP authorization check          |
|      |     (S_TABU_DIS, S_DEVELOP, ...)    |
|      +--> execute (read-only by default)   |
|      +--> /ABAPILOT/AUDIT  (who, what,     |
|            when, parameters)               |
+--------------------------------------------+
```

Every request passes four gates in order: whitelist, authorization, execution policy, audit. A failure at any gate stops the request; the audit entry is written regardless.

## In-system components (`/ABAPILOT/` namespace)

- **ICF service node** — the single HTTP entry point; dynamic handler dispatch routes registered operations without per-endpoint development.
- **`/ABAPILOT/CONFIG`** — the endpoint registry and whitelist. Operations not present here do not exist as far as any client is concerned. Managed by your team, in your system, transportable like any customizing.
- **`/ABAPILOT/AUDIT`** — append-only request log: user, timestamp, operation, parameters. Built for internal audit and compliance review.
- **Authorization enforcement** — delegated to the standard SAP authorization model on every call; roles and profiles you already maintain keep working unchanged.

## The MCP layer

The MCP server runs outside SAP, on infrastructure you control. It translates Model Context Protocol tool calls into requests against the SICF endpoint, carries the SAP user context, and returns structured results the AI client can reason over. Because it speaks standard MCP, any compliant client works — today that includes Claude, Claude Code, Cursor and ChatGPT; tomorrow's clients inherit compatibility for free.

## Deployment shape

One ABAP transport + one service activation + one container (or local process). Typical time from files-in-hand to first natural-language query on a dev system: about two hours. Nothing about the deployment interferes with a later S/4HANA conversion — the same design carries over.
