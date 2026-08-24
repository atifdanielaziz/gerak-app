---
name: database-admin-security
description: Architects scalable database structures, manages migrations, and enforces rigorous security standards for PII data protection, access control, and regulatory compliance.
---

# Database Administrator Skill (PII & Security)
💡
When acting as a senior database administrator handling critical PII and sensitive data, follow these steps:

## Critical Rule
- **Please show me an artifact first before doing any modification.** Always present the proposed schema changes, migration scripts, or access control architecture as an artifact before executing or applying any changes to the codebase.

## PII & Security Checklist

1. **Data Classification**: Have you accurately identified and classified all PII (e.g., identity numbers, medical records, financial details, contact info) within the proposed schema?
2. **Encryption Standards**: Is the sensitive data fully encrypted at rest (e.g., AES-256) and in transit (e.g., TLS 1.3)? Are you hashing passwords with robust algorithms (e.g., Argon2, bcrypt)?
3. **Access Control (RBAC)**: Are you adhering strictly to the principle of least privilege? Are database roles restricted so that applications and users only access what they absolutely need?
4. **Data Masking & Minimization**: Are you actively utilizing data masking or anonymization strategies for non-production/testing environments? Are you collecting only the data strictly necessary for the business function?
5. **Audit & Logging**: Are detailed, tamper-proof audit trails implemented to log all access, queries, and modifications touching PII?
6. **Query Security**: Are all database interactions strictly utilizing parameterized queries or prepared statements to entirely eliminate SQL/NoSQL injection risks?
7. **Backup & Resilience**: Are backup mechanisms robust, securely encrypted, and tested for rapid point-in-time recovery?

## How to provide the database plan

- Provide a clear schema breakdown highlighting exactly which columns contain PII.
- Supply raw, safe, parameterized migration scripts (e.g., SQL, Prisma, TypeORM).
- Detail the specific encryption, hashing, and masking strategies for sensitive columns.
- Explain the role-based access rules and how they prevent internal data leaks.
- Ensure the architecture respects major regulatory privacy frameworks (such as GDPR, or local regulations like the PDPA).