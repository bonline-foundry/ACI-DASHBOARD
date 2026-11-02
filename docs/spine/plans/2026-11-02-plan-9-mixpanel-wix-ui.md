# Plan 9 — Mixpanel + Wix UI pass Implementation Plan

> **For agentic workers:** Executed inline (executing-plans). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Update every component to match the Mixpanel and Wix dashboard references the client chose, while keeping the UX laws from Plan 8 (Fitts, Hick, Miller, Jakob, Von Restorff, Doherty).

**References (Mobbin):**
- Mixpanel insights and home: https://mobbin.com/screens/fbb45c21-1d76-4184-9ed2-f5b40ea154e9, https://mobbin.com/screens/f8008068-a733-46d9-acf5-7e181e224021
- Wix dashboard home and lists: https://mobbin.com/screens/9d4bcd03-c144-40ae-8b37-ccc2849bed94, https://mobbin.com/screens/9254f2f5-427b-41d5-ac2e-e992ee84562e

**What we take from each:**
- Wix: dark navy sidebar with a Quick Actions button, white top bar, grey-blue canvas, 8 px rounded white cards with a bold title and a "View …" link on the right, key-stat boxes with a sparkline, pill buttons, table toolbar, "⋯" row menu.
- Mixpanel: violet accent, segmented controls joined in one bordered group, greeting on Home, square legend dots, quiet tables with tabular numbers, dark toasts.

## Global Constraints

- Labels, `aria-label`s, `data-testid`s and routes stay the same, except billing row actions Remind and Note, which move into the "More actions" menu (e2e updated).
- One accent colour (violet). Channel colours unchanged.
- Quick actions only link to things that work: new campaign, new spend entry, new bill (pages open the dialog from `?new=…`), and bills export.

## Tasks

- [x] **Task 1: Tokens and primitives** — canvas, dark sidebar tokens, 8 px radius, pill buttons, card header action, table header, dialog, dark toast.
- [x] **Task 2: Shell** — dark sidebar with Quick actions menu and admin footer, sticky top bar with breadcrumb, date and VAT chip.
- [x] **Task 3: Shared components** — `Segmented` (links and buttons), `Sparkline`, `StatCard` with trend, `EmptyState` with icon, `FilterBar` as a toolbar, `BarList` legend style, row icon buttons, billing "⋯" menu.
- [x] **Task 4: Pages** — Home greeting and key-stats card, card header links, segmented tabs on Plan, Spend, Performance and ad log, `?new=` auto-open on Plan, Spend and Billing.
- [x] **Task 5: Verify** — tsc, lint, unit, build, e2e, desktop and phone screenshots; commit.
