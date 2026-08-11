# Gerak UI/UX Design Standards

The following design standards must be adhered to when modifying or creating UI components and pages in this project:

## 1. Receipt Standard
- **In-App:** A monospace card featuring a blue date/time, dashed dividers, and a "Save as PDF" button.
- **PDF Export (via iframe print):** Features the Gerak wordmark, a two-column row layout, dashed `<hr>` lines, the booking reference, and a standard footer. Applies universally to all services.

## 2. Sheet Standard
- Bottom sheet sizing: `max-h-[calc(100dvh-5rem)]`.
- Scrolling must happen directly on the sheet itself (not inside an inner card).
- Bottom padding clearance: `6.5rem` for general content or `5rem` for sticky footers.

## 3. Dropdown Standard (Superseded)
- The legacy custom `Dropdown` component is superseded by the `NativeSelect` component.
- Uses the same props shape.
- Renders inline directly below the trigger using `position: absolute` with no full-screen backdrop overlay.

## 4. Drawer Standard
- Visual shell for bottom sheets: `rounded-t-3xl`, shadow, drag pill, label + "X" close button in header, and a slide-up transition animation.
- Always paired with the **Sheet Standard**.

## 5. Bare Drawer Standard
- Same visual treatment as the **Drawer Standard** but optimized for pages without bottom navigation.
- Bottom clearance is set specifically to `calc(1.5rem + env(safe-area-inset-bottom))`.

## 6. Icon Standard
- All interactive/tappable icons must use `lucide-react` icons.
- `WaIcon` (custom WhatsApp icon) is the sole exception since the WhatsApp logo is not included in Lucide.

## 7. Sub-page Standard
- Inline, state-driven content replacement (not a modal overlay).
- The permanent top header remains visible.
- The back button is placed directly in the content flow.
- Bottom padding clearance: `6.5rem + env(safe-area-inset-bottom)`.

## 8. Clean Page Standard
- White background/canvas.
- Border-only cards (no box shadows).
- White inputs with a `border-slate-100` border.
- Clean section headers (sentence case, no uppercase or letter-spacing/tracking-wider styling).
- Functional accent colors only (no arbitrary color highlights).

## 9. Border Standard
- Standard border: `border-slate-100` everywhere.
- Standard border-radius scale: `rounded-3xl` / `rounded-2xl` / `rounded-xl`.
- No shadows on cards or list rows.
- Tappable rows must end with a Lucide `ChevronRight` icon.

## 10. Slim Type Standard
- Typography weights:
  - `font-black` for prices.
  - `font-semibold` for names, headers, and primary CTAs.
  - `font-normal` for labels, hint text, and metadata.
- Must always be paired with the **Clean Page Standard**.

## 11. Plain Selector Button
- Layout: icon + label + `ChevronDown`.
- No pill background or solid background container.
- Used for contextual header selectors (e.g., campus selector, locations, or list filters).

## 12. Solo Card Standard
- Tappable lists: each row must be its own independent card using `border-slate-100 rounded-2xl` (flex column, gap-2).
- Do not group cards with internal dividers or borders between rows.

## 13. Nav Standard
- The back button lives only inside the `Header`.
- Strict floor-vs-service-history routing rules.
- Elastic bounce behavior at the floor view.
- Handled by a single centralized `popstate` event listener inside `AppContext`.

## 14. Mode Selector Standard
- Layout: Two side-by-side bordered cards for binary switching (replaces legacy pill toggles).
- Active/inactive colors are superseded by the **Field Standard** selected state styling.

## 15. Field Standard
- Any tappable bordered card (regardless of size): white background + `border-slate-100`.
- Press/tap feedback: `active:bg-slate-50` + `scale-0.99` transition.
- Selected state: `border-slate-900`.
- Input focus state: `border-slate-900`.
- No color tints on fields.

## 16. Toggle Red Standard
- Pill/tab toggles or switches, when active, must use primary red (never amber, emerald, indigo, etc.). *Note: Bordered card selectors are classified as Fields, not toggles.*
- All toggles/selectors must fire on `onPointerDown` + `preventDefault()` using GPU-accelerated transforms (`transition-transform` + `transform-gpu`) rather than `onClick` + standard transitions to bypass WebView/iOS PWA repaint lag and tap latency.

## 17. Floating Message Standard
- White rounded cards using **Border Standard** colors.
- Stacked full-width text-only action rows.
- Used for multi-option prompt selections (distinct from the side-by-side buttons in `ConfirmModal`).

## 18. Book Now Standard
- White bordered card containing the total price + a `bg-primary` CTA button.
- The button features a deliberate shadow: `shadow-lg shadow-primary/30` (this is a sanctioned shadow exception).
- Used on all "total price + confirm action" screens.

## 19. Header Standard
- Page-title block format: A neutral Lucide icon (`w-5 h-5 text-slate-400`) to the left of a `font-semibold` title, with a `font-normal text-slate-400` subtitle positioned directly below.
- The service-specific icon should match the icon used on the Dashboard service selection tiles.
