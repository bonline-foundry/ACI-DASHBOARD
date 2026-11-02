# Plan 8 — UI polish (Mixpanel / Wix direction) Implementation Plan

> **For agentic workers:** Executed inline (executing-plans). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Restyle the whole dashboard toward the clean analytics look the client likes (Mixpanel, Wix): cool neutral canvas, white cards, one violet accent, grouped icon sidebar, KPI tiles, larger targets, and fewer visible choices. No data or behaviour changes.

**Architecture:** Change shared layers first so every page inherits them: theme tokens (`globals.css`), shadcn primitives (button, input, card, table), shell (sidebar, page header, layout), and shared data components (upload panel, bar list, filter bar). Add two components, `StatCard` and `PageSkeleton`, and use them on Home, Spend and Billing.

## UX laws applied

| Law | Where it shows |
| --- | --- |
| Fitts's law (bigger, closer targets are faster) | Buttons 36 px tall (32 px small), inputs and selects 36 px, sidebar rows 40 px with the whole row clickable, KPI tiles are whole-card links, the main action of each card sits in the same top-right place. |
| Hick's law (more choices, slower decisions) | Sidebar grouped into 4 short sections; upload panels collapsed behind one "Upload Excel" button until used; one filled (primary) button per card, the rest outline or ghost; segmented controls keep 3–6 options. |
| Miller's law / chunking | KPI strips hold 4 tiles at most; long pages split into titled cards. |
| Jakob's law (users expect familiar patterns) | Left sidebar + page title + KPI row + chart cards + tables, the layout used by Mixpanel, Wix and most analytics tools. |
| Von Restorff effect (the different item is remembered) | Only alerts, "Best value" and overdue items use strong colour; everything else stays neutral. |
| Doherty threshold (respond within 400 ms) | Skeleton placeholders instead of "Loading…" text while data streams in. |
| Law of common region / proximity | Related controls and numbers sit inside the same card; filters sit directly above the table they filter. |

## Global Constraints

- Keep every label, `aria-label`, `data-testid` and route unchanged so the e2e suite keeps passing.
- One accent colour (violet, like Mixpanel). Channel colours stay as they are because they carry meaning.
- Text contrast stays at WCAG AA or better; focus rings stay visible.

## Tasks

- [x] **Task 1: Tokens and primitives** — cool neutral palette (stone → gray), violet primary, card border + soft shadow, table header style, button/input sizes.
- [x] **Task 2: Shell** — grouped icon sidebar with brand mark and footer, page header, content width, mobile nav.
- [x] **Task 3: Shared components** — `StatCard`, `PageSkeleton`, collapsible `UploadPanel`, accent colours in bars and links.
- [x] **Task 4: KPI strips** — Home (live, starting soon, unpaid, overdue), Spend (month total, change vs last month, entries, brands), Billing counters as `StatCard`.
- [x] **Task 5: Verify** — tsc, lint, unit, build, e2e, screenshots of every page; commit.
