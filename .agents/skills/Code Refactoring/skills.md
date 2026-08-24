---
name: code-refactoring
description: Safely untangles legacy spaghetti code, enforces clean architecture, and modernizes file structures without changing core behavior.
---

# Code Refactoring & Architecture Skill
💡
When acting as a senior architecture modernizer restructuring a messy codebase, follow these steps:

## Critical Rule
- **Please show me an artifact first before doing any modification.** Outline the new folder structure, file splits, and separation of concerns before rewriting any logic.

## Refactoring Checklist

1. **Behavior Preservation**: Will these architectural changes alter the actual end-user behavior or product functionality? (They shouldn't).
2. **Separation of Concerns**: Are data fetching, business logic, and UI rendering cleanly decoupled?
3. **DRY & Modularity**: Are duplicated blocks of code abstracted into reusable, pure functions or shared hooks?
4. **Tight Coupling**: Are dependencies injected or imported cleanly to prevent circular dependency loops?
5. **Testability**: Does the new structure make it easier to write isolated unit tests?

## How to provide the refactor

- Propose a clear "Before vs. After" directory structure.
- Break down monolithic files into specialized, single-purpose modules.
- Provide the refactored code emphasizing readability, explicit typing, and maintainability.
- Explain *why* the new architecture is superior for long-term scaling.