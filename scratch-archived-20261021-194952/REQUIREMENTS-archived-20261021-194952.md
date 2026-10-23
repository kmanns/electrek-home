# Requirements: Complete config.json for Adobe Commerce Optimizer (ACO)

## Task
Ensure `config.json` is properly set up for Adobe Commerce Optimizer, filling in the catalog service (`cs`) header values (`AC-View-ID`, `AC-Price-Book-ID`) with the tenant's default View and Price Book, and completing any other fields we have enough information to fill in.

## Current State (`config.json`)
- `adobe-commerce-optimizer: true` already set — ACO is enabled.
- `commerce-endpoint`: `https://na1-sandbox.api.commerce.adobe.com/8PxVw1vHCrSKt7NF92x3Na/graphql`
- `analytics.environment-id`: `8PxVw1vHCrSKt7NF92x3Na` (matches the endpoint's tenant ID)
- `analytics.environment`: `"Testing"`
- Remaining placeholders: `AC-View-ID`, `AC-Price-Book-ID`, `base-currency-code`, `locale`, `store-url`, `store-view-currency-code`, `storefront-template`, `view-id`, `plugins.picker.rootCategory`

## Investigation Done
- Checked `demo-config-aco.json` and `demo-config.json` in the repo — these are **generic boilerplate reference samples for a different tenant** (`environment-id: 8idEEDDiVwjCEJAyB5kjfi`, a different sandbox instance), not this project's values. Reusing those IDs would point the storefront at the wrong Commerce tenant/catalog.
- Checked for a connected Commerce/App Builder MCP tool (`commerce-extensibility` MCP server is declared in `.mcp.json` but is not currently connected/available in this session) — no live tool access to query this tenant's Catalog Service for its actual View ID or Price Book ID list.
- `AC-View-ID` / `AC-Price-Book-ID` and `analytics.view-id` are tenant-specific catalog service identifiers — they cannot be derived from documentation or generic patterns; they must come from this Commerce instance's Catalog Service (View/Price Book) configuration.

## Open Questions for User
1. **AC-View-ID / view-id** — What is the default Catalog Service View ID for this environment (`8PxVw1vHCrSKt7NF92x3Na`)? (Found in Commerce Admin → Catalog Service → Views, or via the Catalog Service Saas Manager.)
2. **AC-Price-Book-ID** — What is the default Price Book ID/code to use?
3. **store-url** — What is the live/preview URL for this storefront (e.g. `https://main--electrek-home--<org>.aem.live/`)?
4. **base-currency-code / store-view-currency-code** — What currency should be used (e.g. `USD`)?
5. **locale** — What locale/language should be used (e.g. `en-US`)?
6. **storefront-template** — Is there a specific template name, or should this be `"Other"` (per the demo sample)?
7. **plugins.picker.rootCategory** — What is the root category ID for the product picker?
8. Do you have credentials/access to the Adobe Commerce Admin (or Catalog Service Saas Manager) for this environment so we can look these values up together, or would you like to provide them directly?

## Phase 1: Complete ✅
Date: 2026-07-17
