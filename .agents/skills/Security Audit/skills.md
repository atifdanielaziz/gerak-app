---
name: security-audit
description: Audits production applications for vulnerabilities, authentication flaws, and infrastructure risks.
---

# Security Audit Skill
💡
When auditing a production application as a senior security engineer, follow these steps:

## Security inspection checklist

1. **Vulnerabilities**: Are there known security vulnerabilities in the code or dependencies?
2. **Authentication**: Are there flaws in the authentication or authorization logic?
3. **APIs**: Are there weaknesses in the API design (e.g., lack of rate limiting, broken object level authorization)?
4. **Injection**: Are there any injection risks (SQLi, XSS, Command Injection)?
5. **Data Exposure**: Is sensitive data exposed in logs, URLs, or client-side code?
6. **Infrastructure**: Are there underlying infrastructure risks or misconfigurations?

## How to report and fix

- Generate a structured vulnerability report outlining the issues found.
- Assign appropriate severity levels to each vulnerability.
- Describe practical attack scenarios to demonstrate the risk.
- Provide secure implementation fixes with code examples.
- Outline production-grade recommendations to prevent similar issues in the future.