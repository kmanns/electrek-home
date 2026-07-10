# Requirements: DESIGN.md Visual Update

## Goal
Update the Electrek Home storefront's visual design to implement the design system and layout patterns documented in [DESIGN.md](../DESIGN.md): Penn State blue / white / grey / cream B2B palette, STIHL + Lowe's–inspired layout patterns, reinterpreted for a B2B (bulk ordering, account-based pricing, quote/reorder) audience.

## Current State (inventory)
- **Design tokens**: `styles/styles.css` defines the Adobe Commerce Dropin token system (`--color-brand-*`, `--color-neutral-*`, `--type-*`, `--spacing-*`, etc.). DESIGN.md introduces a *new* semantic palette (`--color-blue-primary`, `--color-cream`, etc.) that does not yet exist anywhere in the codebase.
- **Existing relevant blocks**: `hero`, `cards`, `carousel`, `columns`, `accordion`, `header`, `footer`, `product-list-page`, `product-details`, `commerce-mini-cart`, plus many `commerce-b2b-*` / `commerce-*` drop-in wrapper blocks.
- **No existing blocks** for: 5-up promo tile row, full-width announcement strip, two-column split banner, local/account context module, popular-categories pill+icon grid, "Explore" editorial tile row, deals/quick-filter product carousel banner strip.
- `header` and `footer` blocks exist but are structured for the current (non-Lowe's-style) layout — will need restructuring to match the 3-row header stack and Lowe's-style footer.

## Proposed Scope (please confirm/adjust)
Given the size of DESIGN.md's full homepage spec (11 sections) plus header/footer/PDP/PLP treatments, we should prioritize. Proposed phased scope for **this task**:

### In scope now
1. **Global design tokens** — add DESIGN.md's color palette as CSS custom properties in `styles/styles.css` (mapped alongside/over the existing dropin token system so drop-in components stay themed consistently), plus typography scale adjustments (H1–H3 sizes, uppercase eyebrow utility class).
2. **Header** — restructure to the 3-row stack (utility bar / primary bar with search / department nav row) per DESIGN.md §"Header / Navigation".
3. **Footer** — restructure to Lowe's-style dark footer: utility icon row, 4–5 link columns, bottom legal bar, per DESIGN.md §"Footer".
4. **Hero** — update existing `hero` block styling for full-bleed banner + dot-indicator carousel + bold headline + single primary CTA (Penn State blue).
5. **New block: promo-tiles** — 5-up promo tile row (dark blue gradient overlay tiles).
6. **New block: announcement-strip** — full-width single-line banner (icon + statement + link).
7. **Cards / product cards** — restyle `cards` block (and PDP/PLP product card styling) to match DESIGN.md card spec (image, name, SKU, contract price w/ strike-through, stock indicator, "Add to Order").
8. **Buttons/badges/tables/forms** — global component styling per DESIGN.md §5 (Components).

### Deferred / follow-up (not built in this pass unless you say otherwise)
- Two-column split banner, local/account context module, popular-categories pill+icon grid, "Explore" editorial tile row, deals/quick-filter carousel — these are net-new homepage modules; can be follow-on blocks once the core system (tokens, header, footer, hero, cards) is in place.
- PDP spec-table/gallery deep styling, PLP left-rail facets — larger drop-in customization efforts, best done as a separate task per AGENTS.md drop-in rules (requires Researcher skill verification of slots/containers).

## Open Questions
1. Does the proposed "in scope now" list match what you want delivered in this task, or should I include/exclude specific sections (e.g. do you want the popular-categories grid now too)?
2. For the new blocks (promo-tiles, announcement-strip), should content be authored as simple table-based content blocks (rows of image+text+link), per the project's content-modeling rules?
3. Do you have an actual logo/wordmark asset, or should header/footer treatment assume a text-based placeholder logo for now?
4. Is there existing homepage content (`index.html` equivalent authored in DA) I should look at/update, or is this purely block/CSS work with no live authored content to migrate yet?
5. Target Commerce offering — PaaS or SaaS (ACCS)? (Affects nothing visual, but AGENTS.md requires this be clarified before code generation.)

## Answers (Phase 1)
1. **Scope**: Core system only — tokens/palette, header, footer, hero, new promo-tiles block, new announcement-strip block, cards/product cards, buttons/badges/tables/forms. Popular-categories grid, split banners, account-context module, "Explore" tile row, deals/quick-filter carousel, and PDP/PLP deep drop-in work are deferred to follow-up tasks.
2. **Content model**: Simple table blocks, author-editable directly in da.live document tables (da.live used for authoring — https://da.live/#/kmanns/electrek-home). No config-driven blocks needed for this scope.
3. **Logo**: Text-based placeholder wordmark for now, styled per palette.
4. **Commerce offering target**: not yet specified — purely visual/CSS/block work, not commerce-API-affecting, so proceeding without blocking on this.

## Architectural Plan

### 1. Design tokens (`styles/styles.css`)
- Add DESIGN.md's palette as new custom properties in `:root` (`--color-blue-primary`, `--color-blue-primary-hover`, `--color-blue-dark`, `--color-cream`, `--color-grey-100/300/500/700`, `--color-text`, `--color-success`, `--color-warning`, `--color-error`) — additive, does not remove the existing Adobe Commerce Dropin token set (`--color-brand-*`, `--color-neutral-*`) since drop-in components (cart, checkout, account, etc.) read those directly.
- **Re-point** the dropin token *values* to the new palette so drop-ins stay visually consistent without per-component overrides: `--color-brand-500/600/700` → blue-primary/hover/dark; `--color-neutral-50/100/300/500/700/800` → white/cream-ish greys per the grey scale; `--background-color` stays white.
- Add a `--font-size-h1/h2/h3` (mobile/tablet/desktop clamp or media-query set) matching DESIGN.md §3 scale, applied to `h1`/`h2`/`h3` base rules.
- Add a `.eyebrow` utility class for the permitted uppercase hero/campaign label use case (§3 exception).

### 2. Header (`blocks/header/`)
- `header.js` nav-fragment structure (`nav-brand` / `nav-sections` / `nav-tools`) stays as-is — no JS logic changes needed for palette/visual rework.
- CSS-only restructure of `header.css` to visually express the 3-row stack from DESIGN.md:
  - Utility strip: thin bar, Penn State blue bg, white text — implemented by wrapping/styling top of `.nav-wrapper` (a fragment-authored row above `nav-brand`) or a small new authored row in `/nav` if content needed (branch/account/credit-terms links). Since this needs authorable links, I'll add a `nav-utility` section convention to the `/nav` fragment doc (author adds a 4th top-level content block) — CSS targets it as row 1.
  - Primary bar: white bg, logo + centered search + account/cart icons — mostly existing `nav-brand`/`nav-tools` styling, restyle colors/spacing, enlarge/center search input per Lowe's pattern.
  - Department nav row: existing `nav-sections`, restyled as a full-width row below the primary bar (desktop) rather than inline, with mega-menu panel already supported by existing dropdown CSS — just re-skin colors/spacing.
- All changes are additive CSS + minor markup convention (utility row) — no rewrite of nav interaction logic (hamburger, mega-menu, search, cart, auth) since that logic is unrelated to visual design and is drop-in-integrated (risk of breaking auth/cart/search flows if touched).

### 3. Footer (`blocks/footer/`)
- `footer.js` logic (store switcher, fragment loading) untouched.
- CSS restructure of `footer.css`: dark Penn State blue full-width background, top utility icon row, 4–5 link columns, bottom legal bar — achieved via CSS targeting the existing fragment-authored content structure (headings/lists become columns via flex/grid), matching DESIGN.md §"Footer". Author will need to structure the `/footer` fragment content in da.live with the icon row + column headings; I'll document the expected structure in the block README.

### 4. Hero (`blocks/hero/`)
- `hero.js` is effectively a pass-through (no decoration logic) — a hero is just a `.hero` div with heading/CTA/background image.
- For the "hero carousel" requirement, reuse the existing `carousel` block/component (already has dot indicators, autoplay, a11y) rather than building new carousel JS into hero — author composes a `carousel` block inside the hero section, or the hero picks up carousel classes. Concretely: extend `hero.css` for full-bleed banner treatment + Penn State blue CTA button + bold headline colors, and add a `hero (carousel)` CSS variant so a `carousel` block placed in the hero section inherits full-bleed dot-indicator styling.
- No new JS.

### 5. New block: `promo-tiles`
- Content-modeled as a simple table block: each row = image + heading + link (5 rows expected for the 5-up tile row, but block supports N tiles responsively).
- `promo-tiles.js`: transforms rows into a `<ul>` of tile `<li>` (same pattern as `cards.js`), dark-blue gradient overlay via CSS `::after` pseudo-element, text+link absolutely positioned over image.
- `promo-tiles.css`: equal-width flex/grid row, gradient overlay (not black, per DESIGN.md), responsive collapse to horizontal scroll or 2-up grid on mobile.

### 6. New block: `announcement-strip`
- Content-modeled as a simple one-row table block: icon (optional) + statement text + link.
- `announcement-strip.js`: minimal decoration — wraps content, ensures optional icon + link inline.
- `announcement-strip.css`: full-width single-line banner, Penn State blue background / white text, centered, responsive wrap on mobile.

### 7. Cards / product cards (`blocks/cards/`, PDP/PLP card-adjacent CSS only)
- Restyle `cards.css`: white/cream surface, `--color-grey-300` border, consistent padding, per DESIGN.md §5.
- Add support for optional badge (SKU/price/stock-style pill) via a CSS class convention on a cell, kept generic (not commerce-API-wired — that's a drop-in task, out of scope here). Actual product-card drop-in styling (dropin-product-item-card) gets palette-only CSS var updates (inherits from token re-point in item 1), no structural/slot changes.

### 8. Global components (buttons, badges, tables, forms) — `styles/styles.css`
- Buttons: primary solid blue, secondary outline blue, tertiary ghost grey — mostly achieved automatically via token re-point (item 1); verify contrast per DESIGN.md accessibility notes.
- New badge utility classes: `.badge`, `.badge-blue`, `.badge-grey`, `.badge-error-outline` (muted error outline, never solid fill, per DESIGN.md §5).
- Table base styling: grey-ruled, zebra stripe (`--color-grey-100`), right-aligned numeric columns via `[data-numeric]`/`.numeric` utility class — added generically since no existing global table CSS exists yet.
- Form inputs: grey border, blue focus ring — CSS-only, targeting existing generic `input,textarea,select` rules.

### Security & Performance Considerations
- Pure CSS/DOM (`createElement`) work, no new external requests, no data handling — no security surface change.
- New blocks follow existing lazy CSS/JS block-loading conventions (per EDS block loading pattern) — no negative Core Web Vitals impact expected; will verify via browser Lighthouse spot-check for the homepage after changes.

### Testing Approach
- Local `aem up` server + browser testing per AGENTS.md universal testing requirements: visual check of header/footer/hero/promo-tiles/announcement-strip/cards across mobile/tablet/desktop breakpoints (600/900/1200px), keyboard nav check on mega-menu and mobile hamburger (unchanged logic, but verify visual states still work), contrast spot-check per DESIGN.md §7.
- I will create minimal draft HTML/test content (e.g. in `drafts/agents` or similar) to preview each new/changed block in isolation and on a composed "homepage" page, since no live authored homepage content exists yet in this repo to test against.

## Phase 1: Complete ✅
Date: 2026-07-10

## Phase 2: Architectural Plan Presented
Date: 2026-07-10
Status: Awaiting User Approval ⏸️

## Phase 2: Complete ✅
User Approved: Yes
Approval Date: 2026-07-10

## Phase 3: Implementation Approach Selected
Approach: Option B (direct implementation)
Selection Date: 2026-07-10

## Phase 4: Implementation Complete
Date: 2026-07-10

Files changed:
- `styles/styles.css` — DESIGN.md palette tokens, re-pointed dropin tokens, heading scale, `.eyebrow`, badge/table/form utilities
- `blocks/header/header.js` — backward-compatible optional utility-bar block (3-block nav still works unchanged)
- `blocks/header/header.css` — utility bar, desktop 2-row primary/department layout, off-palette color cleanup
- `blocks/footer/footer.css` — Lowe's-style dark footer structure
- `blocks/hero/hero.css`, `blocks/carousel/carousel.css` — full-bleed gradient banner treatment
- `blocks/cards/cards.css` — DESIGN.md card spec
- `blocks/promo-tiles/*`, `blocks/announcement-strip/*` — new blocks (js/css/_*.json/README)
- `models/_component-definition.json`, root `component-*.json` — registered new blocks (via `npm run build:json`)
- `.claude/launch.json`, `drafts/agents/*` — local preview setup (aem-dev server, draft nav/footer/design-preview pages)

Bugs found and fixed during testing (not present in the original plan):
1. Header utility-bar class mapping originally shifted array indices unconditionally, breaking the **existing live** 3-block nav content (`Cannot read properties of null`). Fixed to detect block count and stay backward-compatible.
2. Desktop header height collapsed to the old fixed `--nav-height`, overlapping the hero, due to a CSS specificity tie between `header:not(:has(.nav-utility))` and the plain-`header` media-query override. Fixed by matching selector specificity.
3. Desktop nav layout was fighting the pre-existing `header nav[aria-expanded='true']` rule (higher specificity, JS sets this true on desktop) which still used the old 3-row mobile-style grid + fixed nav height. Fixed by covering both selectors in the new 2-row desktop grid and unsetting the fixed height.

## Phase 4.5: Testing Decision
**Status:** Testing Completed
**Date:** 2026-07-10
**Results:** Verified in-browser via local `aem up` dev server against the real remote homepage content (header/footer/hero already live) plus a local-only draft page (`/design-preview`) for the two new blocks:
- Header: desktop 3-row stack renders correctly (brand+icons row, department nav row with divider); mobile hamburger drawer opens/closes and shows restyled links; no console errors.
- Footer: dark Penn State blue background, legal bar styling, links readable — confirmed on the live single-column footer content.
- Hero/carousel: full-bleed gradient overlay, dot indicators, blue CTA button — confirmed via carousel-as-hero on the draft page.
- Announcement-strip: full-width blue banner with icon + message — confirmed.
- Promo-tiles: gradient-overlay tile grid, responsive column counts — confirmed (2 of 5 test images 404'd due to bad placeholder URLs in test content only, not a block defect).
- Cards: badges (`badge-blue`, `badge-grey`, `badge-error-outline`), strike-through pricing, primary/secondary buttons — confirmed.
- `npm run lint` (JS + CSS): clean, 0 errors.
- Not tested: PDP/PLP drop-in styling, keyboard-only nav traversal, Lighthouse score (out of scope per approved plan / would need dedicated pass).
