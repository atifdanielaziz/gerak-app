# Gerak UI/UX Standards

This file records standards added after the original nineteen Gerak UI/UX standards supplied by the product owner.

## Table Standard

Tables use the current borderless directory layout, stable headers and Excel-style axis locking. The card remains fixed while only the table content scrolls. Vertical gestures move only vertically; deliberate horizontal gestures move only horizontally, and a single gesture must never create diagonal movement. On mobile, both axes use controlled momentum/inertia after a flick while continuing to respect the axis selected at the start of that gesture. Momentum stops cleanly at the table boundary, and overscroll is contained so the table cannot drift, rubber-band, or move outside its card. Interactive controls and three-dot menus are excluded from the drag engine so taps remain reliable. On desktop, every horizontally scrollable table exposes a visible bottom scrollbar/cursor and wheel or trackpad movement remains axis locked; on mobile the scrollbar is hidden while touch scrolling remains available.

## Overview Standard

Overview cards use the established colored Lucide metric tiles and a plus/minus expand control. They are collapsed by default and expand only when requested.

## Save Button Standard

Unsaved changes show the primary Save treatment. After a successful save, the button changes immediately to the neutral bordered `Saved` state, with no intermediate black-text or delayed active-color flash.

## Scrollable Page Standard

Any page that scrolls must use the app shell's dedicated vertical scroll region, contain elastic overscroll, and return naturally to the BottomNav boundary. The BottomNav already owns its layout row, so normal pages use compact trailing clearance rather than sheet-style `6.5rem` padding. Content must never be hidden behind the navigation and overscrolling must not leave a persistent blank gap.
