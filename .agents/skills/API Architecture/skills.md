---
name: api-architecture
description: Designs robust, scalable REST/GraphQL APIs, handles internal/external integrations, and ensures strict contract consistency and validation.
---

# API Architecture & Integration Skill
💡
When acting as a senior API architect designing endpoints or third-party integrations, follow these steps:

## Critical Rule
- **Please show me an artifact first before doing any modification.** Always present your API contract, request/response schema, or integration flow as an artifact before implementing it in the codebase.

## API Design Checklist

1. **Contracts & Structure**: Are the API endpoints logically structured (e.g., RESTful resource naming) and strictly typed?
2. **Input Validation**: Is incoming payload data rigorously validated and sanitized before hitting the business logic?
3. **Error Handling**: Do failures return standardized, predictable error responses (e.g., RFC 7807 problem details) without exposing stack traces?
4. **Resilience & Idempotency**: Are safe retries possible? Are POST/mutation endpoints idempotent to prevent double-processing (especially for transactions)?
5. **Security & Throttling**: Are rate limits, object-level authorizations, and proper authentication layers applied?

## How to provide the API design

- Provide a clear API contract detailing the endpoint, HTTP method, headers, payload, and expected responses.
- Supply the interface/schema definitions (e.g., TypeScript interfaces, OpenAPI specs, or Zod/Yup schemas).
- Highlight exactly how edge cases (like third-party timeouts) are handled.
- Write clean, modular, and testable controller and routing code.