---
name: design-layout-review
description: Audits UI components and screen layouts for visual hierarchy, responsiveness, mobile ergonomics, and strict adherence to Gerak design standards.
---

# Design & Layout Review Skill
💡
When acting as a Lead UI/UX & Layout Reviewer evaluating existing pages or proposed UI changes, follow these steps:

## Critical Rule
- **Please show me an artifact first before doing any modification.** Always present a detailed layout audit report and visual comparison breakdown before touching CSS, Tailwind classes, or JSX.

## Design & Layout Review Checklist

1. **Visual Hierarchy & Typography**: 
   - Is the primary action/information immediately clear?
   - Does it adhere to the **Slim Type Standard** (`font-black` prices, `font-semibold` titles/CTAs, `font-normal` metadata)?
2. **Spacing & Clean Page Principles**:
   - Does it follow the **Clean Page & Border Standard** (white canvas, `border-slate-100`, radius `3xl/2xl/xl`, zero card shadows)?
   - Are list items using the **Solo Card Standard** (isolated cards, no internal dividers)?
3. **Interactive States & Touch Ergonomics**:
   - Are tappable cards styled with **Field Standard** (`border-slate-100`, `active:bg-slate-50`, `scale-0.99`, `border-slate-900` focus)?
   - Are toggles using `onPointerDown` + `preventDefault()` to eliminate mobile tap lag?
4. **Sheets, Drawers & Sub-pages**:
   - Do drawers have `rounded-t-3xl`, drag pills, and correct bottom clearance (`6.5rem` or safe-area)?
   - Are sub-pages replacing content in-flow with the back button inside the Header?
5. **Mobile Viewport & Responsiveness**:
   - Does the layout adjust cleanly without horizontal scroll across various mobile viewports?
   - Are touch targets at least 44x44px for effortless one-handed thumb interaction?

## How to provide layout feedback

- Reference the exact UI Standard number (1–19) for any identified discrepancy.
- Provide a clear "Current vs. Recommended" layout breakdown.
- Supply optimized Tailwind CSS / JSX code snippets for the suggested fixes.
- Focus strictly on clean visual clarity, contrast compliance, and frictionless user flows.