# REQUIREMENTS: Prices missing on storefront (ACO)

## Problem
Guest and logged-in shoppers see `$0.00` on PLP/PDP although Adobe Commerce Optimizer has prices.

## Findings (diagnosis)
- `config.json` sets `headers.cs.AC-Price-Book-ID = base_price_book`.
- ACO catalog API returns correct prices with `base_price_book` (e.g. STIHL-BGA200 = 329.99 USD),
  and also with no price book header (falls back to the default price book).
- At runtime the auth drop-in queries the SaaS core (`commerceOptimizer.priceBookId`) and emits
  `auth/adobe-commerce-optimizer` with `priceBookId = geck::<sha1(customerGroupId)>`
  (guest: `geck::b6589fc6ab0dc82cf12099d1c2d40ab994e8410c` = sha1("0")).
- `scripts/initializers/index.js` `setAdobeCommerceOptimizerHeader` overwrites the configured header
  with that value. No such price books exist in ACO → `price: null` → drop-ins render `$0.00`.
  Verified for groups 0, 1, 2, 3.
- Secondary bug: if the event payload has no priceBookId, the handler removes the header entirely
  instead of falling back to the configured `base_price_book`.

## Fix options
1. Storefront: fall back to the configured price book when the customer-specific one is not usable
   (config-driven), keep customer-specific price books working when they exist.
2. Data (ACO): create price books `geck::<hash>` per customer group (e.g. children of
   `base_price_book`) via the ACO Data Ingestion API — no storefront code change.

## Decisions (user answers)
- Approach: mapping in site config + storefront header logic, fallback `base_price_book`.
- Group prices: yes, per group. Existing ACO price books (all verified returning prices):
  base_price_book (329.99), reward_member_price_book (~5% off), contractor_price_book (15% off),
  commercial_price_book (20% off).
- Mapping (default groups):
  | Group (ID) | Commerce priceBookId | ACO price book |
  |---|---|---|
  | NOT LOGGED IN (0) | geck::b6589fc6ab0dc82cf12099d1c2d40ab994e8410c | base_price_book |
  | General (1) | geck::356a192b7913b04c54574d18c28d46e6395428ab | base_price_book |
  | Wholesale (2) | geck::da4b9237bacccdf19c0760cab7aec4a8359010b0 | contractor_price_book |
  | Retailer (3) | geck::77de68daecd823babbb58edb1c8e14d7106e83bb | reward_member_price_book |
  | B2B company groups | TBD (custom group IDs) | commercial_price_book |

## Phase 1: Complete ✅
Date: 2026-11-04

## Phase 2: Architectural Plan Presented
Date: 2026-11-04
Status: Awaiting User Approval ⏸️

### Plan
- `config.json`: add `adobe-commerce-optimizer-price-books` map (Commerce priceBookId → ACO price book ID).
- `scripts/initializers/index.js` `setAdobeCommerceOptimizerHeader`: resolve the event's priceBookId
  through the map; if unmapped or empty, fall back to `headers.cs.AC-Price-Book-ID`
  (never remove the header).
- Security: price book only selects a price list; no secrets. Server-side ACO stays the source of truth.
- Performance: no extra requests; header set before catalog queries (eager event).
- Testing: PLP/PDP as guest (base prices) and as the test user (group price), check request headers.

## Phase 2: Complete ✅
User Approved: Yes (B2B company groups deferred — not set up yet)
Approval Date: 2026-11-05

## Phase 3: Implementation Approach Selected
Approach: Option B (direct — user said "go ahead with the plan")
Selection Date: 2026-11-05

## Phase 4: Implementation Started
Date: 2026-11-05
- config.json: added `adobe-commerce-optimizer-price-books` (groups 0–3).
- scripts/initializers/index.js: setAdobeCommerceOptimizerHeader maps via config, falls back to
  headers.cs.AC-Price-Book-ID.

## Phase 4: Implementation Complete
Date: 2026-11-05

## Phase 4.5: Testing Decision
**Status:** Testing Completed (guest); logged-in pending user verification
**Date:** 2026-11-05
**Results:** Guest PLP (/blowers) and PDP (STIHL-BGA200) show $329.99 etc. (was $0.00). Lint passes.
**Live:** PR #12 merged to main (1d43a9b) on 2026-11-05; live /blowers verified showing prices.
Note: aem-psi-check failed (PLP desktop 79 / mobile 85) — pre-existing on category pages (PR #11: 62–97); tracked as follow-up.
