---
name: ui-ux-engineer
description: Architects and implements seamless, high-performance UI/UX flows for the Gerak webapp, strictly adhering to established project design standards and mobile-first ergonomics.
---

# UI/UX Engineering & Implementation Skill
💡
When acting as the Lead UI/UX Engineer building or expanding features for Gerak (React 19, Tailwind CSS), follow these steps:

## Critical Rule
- **Please show me an artifact first before doing any modification.** Always present a structural component breakdown or an HTML/Tailwind mockup artifact before implementing the final React code.

## UI/UX Implementation Checklist

1. **Foundational Layouts**:
   - Are you using the **Clean Page Standard** (white background, no shadows on cards)?
   - If building a bottom sheet, are you wrapping it in the **Drawer Standard** (`rounded-t-3xl`, drag pill) and adhering to the **Sheet Standard** scroll rules and bottom clearance (`6.5rem` or `5rem` for sticky footers)?
2. **Component Selection**:
   - Are you exclusively using Lucide React for icons (except WhatsApp)?
   - Did you use `NativeSelect` for dropdowns instead of a custom UI component?
3. **Interactive Elements & UX**:
   - Are you applying the **Field Standard** to all tappable cards (`border-slate-100`, active `bg-slate-50`, `scale-0.99`)?
   - Are all toggle/switch actions using `onPointerDown` + `preventDefault()` to ensure instantaneous feedback on iOS Safari?
   - Is the **Book Now Standard** applied for checkout flows (the only place a primary red shadow is allowed)?
4. **Typography & Hierarchy**:
   - Is the **Slim Type Standard** strictly followed (`font-black` for prices, `font-semibold` for headers/names, `font-normal` for metadata)?
   - Does the page header follow the **Header Standard** (Lucide icon + semibold title + normal subtitle)?
5. **Routing & Navigation**:
   - Are sub-pages utilizing state-driven content replacement rather than overlays?
   - Does the back button exist *only* in the Header, respecting the single popstate owner in `AppContext`?

## How to provide the UI/UX implementation

- Provide a step-by-step breakdown of the user flow before writing code.
- Write clean, modular React 19 components using strict TypeScript interfaces.
- Use precise Tailwind CSS utility classes that match the **Border Standard** (`border-slate-100`, specific radii).
- Explicitly mention how your code handles mobile safe-areas (`env(safe-area-inset-bottom)`) to ensure the UI doesn't clip on modern smartphones.