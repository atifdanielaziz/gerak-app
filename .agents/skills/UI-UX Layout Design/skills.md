---
name: ui-ux-design
description: Architects responsive, beautiful, and highly usable UI/UX designs while strictly adhering to established project design standards (Gerak).
---

# UI/UX Design Skill
💡
When acting as a senior UI/UX designer and layout architect, you must follow these steps and project standards:

## Critical Rule
- **Please show me an artifact first before doing any modification.** Always present your visual design, layout structure, or component breakdown as an artifact before implementing or changing the codebase.

## Core UI/UX Standards (Must Follow)
1. **Receipt Standard:** Use an in-app monospace card (blue date/time, dashed dividers, Save as PDF button). PDF via iframe print includes the Gerak wordmark, two-col rows, dashed hr, booking ref, and footer. Applies to all services.
2. **Sheet Standard:** `max-h-[calc(100dvh-5rem)]`. Scroll happens on the sheet itself, not an inner card. Bottom clearance is `6.5rem` (content) or `5rem` (sticky footer).
3. **Dropdown Standard:** Use `NativeSelect` (floats inline below the trigger via `position: absolute`, no full-screen backdrop). Do not use custom Dropdown components.
4. **Drawer Standard:** Visual shell for all bottom sheets: `rounded-t-3xl`, shadow, drag pill, label+X header, slide-up animation. Always paired with the Sheet Standard.
5. **Bare Drawer Standard:** Same as Drawer but for pages without bottom nav. Bottom clearance is `calc(1.5rem + env(safe-area-inset-bottom))`.
6. **Icon Standard:** All tappable icons must be Lucide React only (Exception: `WaIcon` for WhatsApp).
7. **Sub-page Standard:** Use state-driven content replacement (not an overlay). Permanent header stays, back button lives in the content flow, bottom clearance `6.5rem + safe-area`.
8. **Clean Page Standard:** White canvas, border-only cards (no shadows), white inputs (`slate-100` border), clean section headers (no uppercase tracking), functional accent color only.
9. **Border Standard:** `border-slate-100` everywhere, radius scale (`3xl/2xl/xl`), no shadows on cards/rows. Tappable rows end in a `ChevronRight`.
10. **Slim Type Standard:** `font-black` for prices, `font-semibold` for names/headers/CTAs, `font-normal` for labels/hints/metadata. Always pair with the Clean Page Standard.
11. **Plain Selector Button:** Icon + label + `ChevronDown`. No pill/background. Use for contextual header selectors (campus, location, filter).
12. **Solo Card Standard:** Each tappable row is its own `border-slate-100` `rounded-2xl` card (`flex-col`, `gap-2`). No grouped cards with internal dividers.
13. **Nav Standard:** Back button lives only in the Header. Follow floor-vs-service-history rules. Include an elastic bounce at the floor. Use a single popstate owner in `AppContext`.
14. **Mode Selector Standard:** Two side-by-side bordered cards for binary mode switching (replaces pill toggles). Active state colors follow the Field Standard's dark-border-when-active rule.
15. **Field Standard:** Any tappable bordered card = white bg + `border-slate-100`. Active state: `bg-slate-50` + `scale-0.99` on press. Selected/Focus state = `border-slate-900`. No color tints on fields.
16. **Toggle Red Standard:** Any active pill/tab toggle or switch uses primary red (never amber/emerald/indigo). Selectors fire on `onPointerDown` + `preventDefault()` with `transition-transform` + `transform-gpu` (never `onClick/transition` to avoid iOS lag).
17. **Floating Message Standard:** White rounded card (follows Border Standard colors) with stacked full-width text-only action rows. Used for multi-option prompts (distinct from ConfirmModal's side-by-side buttons).
18. **Book Now Standard:** White/bordered total-price card + `bg-primary` CTA button with `shadow-lg shadow-primary/30` (deliberate shadow exception). Use for any "total + confirm" screen.
19. **Header Standard:** Page-title block format: neutral Lucide icon (`w-5 h-5 text-slate-400`) left of a `font-semibold` title, with a `font-normal slate-400` subtitle below. Re-use the service's Dashboard tile icon.

## How to provide the design
- Wait for approval on your UI artifact before writing the final production code (e.g., Tailwind, CSS, React).
- Reference the specific standard number you are applying when proposing a design.
- Optimize the interface keeping iOS Safari quirks (like the PWA tap lag) in mind.