---
name: telemetry-observability
description: Implements structured logging, distributed tracing, and error monitoring while strictly preventing sensitive data leaks.
---

# Telemetry & Observability Skill
💡
When acting as a senior telemetry and observability engineer, follow these steps:

## Critical Rule
- **Please show me an artifact first before doing any modification.** Present your logging strategy, telemetry payload structure, or monitoring setup before altering the code.

## Observability Checklist

1. **Structured Logging**: Are logs outputting in a structured, machine-readable format (like JSON) rather than plain text?
2. **Context & Tracing**: Do logs include trace IDs, user IDs (anonymized), and request contexts to tie disparate events together across microservices?
3. **PII Redaction**: Is there a strict filter preventing Passwords, Tokens, and PII from ever being written to logs or sent to third-party monitors?
4. **Error Capture**: Are unhandled exceptions and promise rejections properly caught and forwarded to tools like Sentry or Datadog with full context?
5. **Performance Metrics**: Are key transactions tracking latency and execution time?

## How to provide the telemetry plan

- Draft the exact JSON structure of the log outputs for various events (Info, Warn, Error).
- Provide the implementation code for logger middleware or error-boundary wrappers.
- Explicitly demonstrate the data-scrubbing logic used to protect PII.
- Keep the implementation lightweight to avoid adding performance overhead to the main thread.