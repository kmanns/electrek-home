# REQUIREMENTS: Category page (PLP) performance below 90

## Problem
aem-psi-check on PR #12 (/blowers): desktop 79 (CLS 0.217, TBT 211ms), mobile 85 (LCP 3.5s, SI 5.0s).
Pre-existing on category pages (PR #11: 62–97). All category pages share the product-list-page block.

## Findings (live site, measured in browser)
Desktop 1350x940 — CLS 0.202 reproduced:
1. Header has no reserved height at >=900px (`header { height: auto }` in styles/styles.css).
   Header goes 0 → 161px (utility 36 + nav row 64 + sections row ~57) and pushes main down: **0.119**.
2. Before results render, main is short so the footer sits mid-viewport, then gets pushed down;
   at the same time the "Sort by" picker widens 66px → 187px: **0.074**.
Mobile/tablet (780px): header reserves 64px because `.nav-utility` doesn't exist until the header
   block loads (`header:not(:has(.nav-utility))`), then grows to 100px → main shifts 36px.
LCP: first product image (from www.stihlusa.com, ~8 KB). Rendered only after PLP drop-in JS +
   catalog GraphQL query; third-party image origin has no preconnect.
Bug: image URLs get `height=NaN` (setupAemAssetsImageParams does Math.floor(undefined)).

## Candidate fixes
- A. Reserve header height on all breakpoints (styles/styles.css).
- B. Reserve PLP results area height + sort picker width (product-list-page.css).
- C. Preconnect to the catalog API and the product image host (head.html) to speed LCP on mobile.
- D. Stop sending `height=NaN` on image URLs (scripts/initializers/index.js).

## Open questions
- Which fixes to include?
- Deliver via a new PR to main (with test URLs) or local only first?

## Phase 1: Complete ✅
Date: 2026-11-05

## Phase 2: Complete ✅
User Approved: Yes — all four fixes (A–D), delivery straight to a PR.
Approval Date: 2026-11-05

## Phase 3: Implementation Approach Selected
Approach: Option B (direct)
Selection Date: 2026-11-05

## Phase 4: Implementation Complete
Date: 2026-11-05
- Branch perf/plp-cls, commit bf5a14a, PR #13.
- Added during testing: mobile utility bar kept on one line (font-swap reflow, 0.027 CLS).

## Phase 4.5: Testing Decision
**Status:** Testing Completed
**Date:** 2026-11-05
**Results:**
- Local CLS (fresh contexts) /blowers: mobile 0.068 → 0.000, desktop 0.129 → 0.009; 320px 0.001.
- PDP / cart CLS ≤ 0.015; homepage no regression (hero h1 font-swap ~0.09 remains, pre-existing).
- PSI check on PR #13: desktop 79 → 99 (CLS 0.012); mobile 80 (CLS 0, LCP 4.0s, TBT 210ms).
- Throttled A/B (live vs branch, 3 runs each): LCP ~4.39s vs ~4.37s → no mobile regression.
- Mobile LCP bottleneck: body hidden until PLP block finishes; catalog search starts ~3.3s, FCP ~3.6s.

**Live:** PR #13 merged to main (0310a06) on 2026-11-05; live /blowers CLS mobile 0 / desktop 0.009, prices OK.
Follow-ups: mobile LCP (page blank until PLP search ~3.6s); homepage hero h1 font-swap reflow.
