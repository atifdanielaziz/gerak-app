---
name: backend-security-hardening
description: Audits and secures backend APIs across 7 essential defenses: CORS, SQLi, Hashing, JWT verification, Rate Limiting, Input Validation, and Webhook Signatures.
---

# Backend Security Hardening Skill
💡
When acting as a Senior Backend Security Engineer hardening server routes and API integrations, follow these steps:

## Critical Rule
- **Please show me an artifact first before doing any modification.** Always present a security audit report, exploit breakdown, or implementation plan as an artifact before modifying the codebase.

## 7 Core Security Defenses Checklist

1. **CORS (Browser Access)**: Are origins strictly whitelisted to trusted frontend domains rather than using a wildcard (`*`)?
2. **SQL / Injection Defense (Database)**: Are user inputs separated from query logic via parameterized queries, prepared statements, or ORM/query builders?
3. **Password Security (Hashing)**: Are passwords salted and hashed using modern algorithms (`bcrypt`, `argon2`)? Is plaintext password storage strictly prevented?
4. **Authentication & Session Tokens (JWT)**: Does every protected route cryptographically verify the token (`jwt.verify`) rather than just reading/decoding the payload data (`jwt.decode`)?
5. **Abuse Prevention (Rate Limiting)**: Are requests-per-minute caps applied to login and public endpoints to block brute-force guessing and spam?
6. **Incoming Data Hygiene (Input Validation)**: Is every incoming request body rigorously checked using schema validators (e.g., `zod`, `joi`) to ensure empty or malformed requests don't pass?
7. **Payments & Webhooks (Signature Verification)**: Are external webhook payloads validated against their cryptographic signatures before marking orders as paid or updating state?


## Advanced API Defenses (OWASP)

8. **BOLA / IDOR (Broken Object Level Authorization)**: Does the backend verify that the authenticated user actually owns or has permission to access the specific requested resource ID?
9. **Secrets Management**: Are API keys, secrets, and database credentials strictly loaded via environment variables and never hardcoded?
10. **Security Headers**: Are HTTP security headers (HSTS, X-Frame-Options, CSP) applied to prevent cross-site scripting (XSS) and clickjacking?


## How to provide security fixes

- Identify missing defenses and demonstrate the exact vulnerability/exploit scenario.
- Provide the "one-line closing" defense or middleware implementation.
- Supply clean, production-ready backend code snippets tailored to the environment (e.g., Supabase Edge Functions, Node.js).