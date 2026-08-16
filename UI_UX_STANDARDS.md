# Gerak UI/UX Standards

This file records standards added after the original nineteen Gerak UI/UX standards supplied by the product owner.

## Table Standard

Tables use the current borderless directory layout, stable headers and Excel-style axis locking. The card remains fixed while table content scrolls. Vertical gestures move only vertically; deliberate horizontal gestures move only horizontally. Overscroll is contained so the table cannot drift outside its card. On desktop, every horizontally scrollable table exposes a visible bottom scrollbar/cursor; on mobile the scrollbar is hidden while touch scrolling remains available.

## Overview Standard

Overview cards use the established colored Lucide metric tiles and a plus/minus expand control. They are collapsed by default and expand only when requested.

## Save Button Standard

Unsaved changes show the primary Save treatment. After a successful save, the button changes immediately to the neutral bordered `Saved` state, with no intermediate black-text or delayed active-color flash.

## Scrollable Page Standard

Any page that scrolls must use the app shell's dedicated vertical scroll region, contain elastic overscroll, and return naturally to the BottomNav boundary. The BottomNav already owns its layout row, so normal pages use compact trailing clearance rather than sheet-style `6.5rem` padding. Content must never be hidden behind the navigation and overscrolling must not leave a persistent blank gap.
