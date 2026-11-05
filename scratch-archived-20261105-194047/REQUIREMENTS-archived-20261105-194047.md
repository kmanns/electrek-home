# REQUIREMENTS: Home page product recommendations show no products

## Findings (live site, 2026-11-05)
1. Content — main home page (`/`): block row label is `rec-id`. `readBlockConfig` turns labels into
   class-name keys, so `rec-id` stays `rec-id`; the block reads `recid` → undefined.
   Console: "ProductList: recId is missing." No recommendations request is sent.
2. Content — experiment variant `/experiments/homepage-hero-2026-09/` (served to part of the traffic
   via `experiment-variants` metadata): the recommendations block is empty (no rows at all).
3. Commerce data: unit `0e1330b0-cd86-4c11-ac54-f2e5745db106` ("Gen Public Recommendation - Home Page",
   label "More Products For You!", type just-for-you) and `8aa79c91-…` ("Home Page Recommendation",
   just-for-you) both return `totalProducts: 0`, even with view history, currentSku and cart SKUs.
   Docs: just-for-you falls back to Most viewed for new shoppers; popularity types need several days
   of aggregate event data.
4. Storefront events are being collected (commerce.adobedc.net/collector/tp2 → 200, environmentId
   8PxVw1vHCrSKt7NF92x3Na, viewId 03fdaffb-…) — data collection itself is wired.
5. Local `content/index.plain.html` is older than the published page (block has no rows locally).
   DA source read returned 401 (DA credential opt-in off).

## Fix options
- Content (DA): rename row label to `recid` on `/`; add the same row to the experiment variant.
- Code (defensive): let the block also accept `rec-id` (and similar) labels.
- Commerce (ACO admin): check unit status, readiness indicators and filters; wait for/generate event
  data or switch the home unit to a type that has data.

## Phase 1: Complete ✅
Date: 2026-11-05

## Phase 2: Complete ✅
User Approved: code alias for `rec-id` + PR; give ACO checklist (no ACO/DA writes).
Approval Date: 2026-11-05

## Phase 3: Implementation Approach Selected
Approach: Option B (direct)
Selection Date: 2026-11-05

## Phase 4: Implementation Complete
Date: 2026-11-05 — branch fix/recs-recid, PR #14 (not merged).

## Phase 4.5: Testing Decision
**Status:** Testing Completed
**Date:** 2026-11-05
**Results:** Live markup (`rec-id` row) on local page → recommendations request sent with unit ID, no
"recId is missing" warning. Still 0 products (unit has no data). ESLint passes.
Pending: experiment variant needs `recid` row in DA; ACO unit data/readiness (user).

**Live:** PR #14 merged (9e71c9c) 2026-11-05; control home page shows unit (1 backup product STIHL-BGA200). Variant still empty (DA row needed).
