# Design System

Design direction for a B2B storefront built on Edge Delivery Services (frontend) with an Adobe Commerce as a Cloud Service backend. Layout and UX patterns are inspired by [stihlusa.com](https://www.stihlusa.com/en) (equipment/dealer commerce) and [lowes.com](https://www.lowes.com/) (big-box retail commerce), reinterpreted with our own color palette and a B2B (bulk ordering, account-based pricing, quote/reorder workflows) rather than pure B2C tone.

## 1. Brand Reference Inspiration

### From STIHL USA
- Bold, uppercase section headers over promotional hero imagery ("SAVE BIG. WORK BIG." style statements).
- Action-oriented product photography (equipment in use outdoors) paired with clean, neutral-background product-only shots for catalog/PDP contexts.
- Horizontal scrollable category/product carousels below the hero.
- Alternating left/right text-and-image promo modules for storytelling (dealer network, service, guarantees).
- Mega-menu navigation with clear hierarchical category → subcategory grouping.

### From Lowe's
Reference: current lowes.com homepage (see screenshot on file). Concrete patterns observed:
- **Header stack**: thin utility bar (store/location, order status, weekly ad) above a primary bar with logo, location/zip picker, prominent center search input, and right-aligned account/cart icons. A secondary row of top-level nav links (Shop All, Installations, Deals, Design & Ideas, department links) sits directly below.
- **Hero carousel**: full-width single large banner with dot-indicator carousel controls, promotional headline + one primary CTA button.
- **5-up promo tile row**: immediately below the hero, five equal-width image tiles (dark gradient overlay + short text + "Shop Now" link) surfacing sub-promotions/categories.
- **Full-width colored announcement strip**: a single-line banner (icon + bold statement + link) between major sections, e.g. shipping/rewards messaging.
- **Two-column split banner**: one editorial/financing tile beside one account/membership-signup tile, same row, same height.
- **Utility/local-context module**: a small "weather/local" card beside 3–4 square article/how-to tiles in a single row.
- **Deals carousel**: a colored (brand-accent) banner strip containing a horizontally scrollable row of product cards with star ratings and review counts.
- **Popular Categories block**: a row of pill-shaped tab buttons (each a different accent color) above a dense icon+label grid (4 columns × several rows) of department links — icons are simple line/duotone glyphs.
- **"Explore" tile row**: 4 image tiles with caption + "Learn More" link, editorial/inspirational tone.
- **Recommended-products grid**: a 2–3 column grid of stacked product cards, each with image, name, rating, price (with strike-through list price), and an "Add to Cart" button; occasional colored "Save X%" badge on the image.
- **Sponsored/carousel rail**: horizontally scrollable product cards under a filter-pill row (category quick-filters), each card with image, price, rating, "Add to Cart".
- **Footer**: full-width dark banner background, top utility icon row (My Lowe's, Help Center, Order Status, Credit Center, Gift Cards, Installation Services, App), then 4–5 link columns (About, Stores & Services, Customer Service, Connect With Us + social icons), and a bottom legal/copyright bar.
- Faceted/filtered product listing pages (left-rail filters: brand, price, attributes) with sortable grid results (standard category-page pattern, not shown in the homepage screenshot but consistent with the site).

### Adaptation for this project (B2B)
- Replace impulse-buy CTAs with B2B-relevant actions: **Request Quote**, **Add to Order**, **Reorder**, **View Contract Pricing**.
- Surface account context prominently once logged in (company name, assigned rep, negotiated pricing tier, credit/PO status).
- Favor information density and scanability (spec tables, SKU/part numbers, bulk quantity selectors) over lifestyle marketing on catalog and PDP pages; reserve lifestyle/marketing imagery for the homepage and campaign landing pages.

## 2. Color Palette

Primary palette: **Penn State blue, white, grey, cream.** No accent orange/red — CTAs and emphasis rely on contrast and weight within this palette, not a hue outside it.

| Token | Hex | Usage |
|---|---|---|
| `--color-blue-primary` | `#001E44` | Penn State blue — header/footer background, primary buttons, key headings, links |
| `--color-blue-primary-hover` | `#00295c` | Hover/active state for primary blue elements |
| `--color-blue-dark` | `#001433` | Deepest shade — text on cream/white for max contrast, dark-mode surfaces if needed |
| `--color-cream` | `#F5F1E8` | Page background alternative to white; section background to create rhythm between content blocks |
| `--color-white` | `#FFFFFF` | Base page background, card surfaces |
| `--color-grey-100` | `#F2F2F2` | Subtle section backgrounds, table stripe |
| `--color-grey-300` | `#D9D9D9` | Borders, dividers, input borders |
| `--color-grey-500` | `#8A8D91` | Secondary text, placeholder text, disabled states |
| `--color-grey-700` | `#4A4D52` | Body text on white/cream |
| `--color-text` | `#1B1D1F` | Primary body/heading text |
| `--color-success` | `#2E7D32` | In-stock / confirmation states |
| `--color-warning` | `#B25E00` | Low stock / attention states (muted, not a brand accent) |
| `--color-error` | `#B3261E` | Form errors, out-of-stock |

Usage rules:
- Backgrounds alternate between `--color-white` and `--color-cream` section-to-section to create visual rhythm (mirrors STIHL's alternating promo modules) without introducing new hues.
- Penn State blue is reserved for primary actions, header/footer, and key headings — do not use it for large body-text blocks (contrast/fatigue).
- Grey is the workhorse for structure: borders, table rules, secondary text, disabled UI, filter rails.
- Never place blue text on cream without checking contrast (`--color-blue-primary` on `--color-cream` passes AA for large text only; use `--color-blue-dark` for small body text on cream).
- **Lowe's reference note**: Lowe's own header/footer navy is close in value to Penn State blue, which is why that structural pattern (dark header utility bar + dark footer band) transfers directly — no palette shift is needed to reuse it. Lowe's does use red as a second brand accent (logo, "Deals" tags, sale badges); we intentionally do **not** carry that over. Where Lowe's uses red for a "Deal"/"Save X%" badge, we use `--color-error` at reduced weight (outline pill, not solid fill) purely as a semantic "promotional/limited-time" indicator, never as a repeating brand color across the page.

## 3. Typography

- Sans-serif system stack, consistent with existing `fonts.css` — no new webfont unless a brand typeface is licensed later.
- Headings: bold weight, sentence case by default; uppercase treatment permitted only for hero/campaign eyebrow labels and section dividers (STIHL-style), not for body headings or nav — uppercase hurts scanability in dense B2B catalog/PDP contexts.
- Body copy: regular weight, `--color-text` or `--color-grey-700`, optimized for spec sheets and tabular data (tabular figures for SKU/price columns where the font supports it).
- Scale (mobile-first, adjust via existing breakpoints at 600px/900px/1200px):
  - H1: 32px → 40px → 48px
  - H2: 24px → 28px → 32px
  - H3: 20px → 22px → 24px
  - Body: 16px
  - Small/meta (SKU, timestamps, labels): 13–14px

## 4. Layout Patterns

### Homepage
Section order, adapted from the Lowe's homepage structure with B2B substitutions:
1. **Hero carousel** (STIHL + Lowe's): full-bleed promotional banner with dot indicators, bold headline, single primary CTA in Penn State blue (e.g. "Shop Contract Catalog").
2. **5-up promo tile row**: five equal-width image tiles (dark blue gradient overlay, not black) linking to sub-categories or seasonal programs — mirrors Lowe's 5-tile row directly below the hero.
3. **Full-width announcement strip**: single-line banner in Penn State blue background / white text for account-wide messaging (e.g. "Free freight on orders over $500 for contract accounts").
4. **Two-column split banner**: one tile for financing/credit terms (Net-30, PO acceptance), one tile for account/rewards program enrollment — same row, equal height, replacing Lowe's financing + membership pair.
5. **Local/account context module**: a card showing the customer's assigned branch or rep (replacing Lowe's weather widget) beside 3–4 how-to/spec-guide article tiles.
6. **Deals/contract-pricing carousel**: colored banner strip (Penn State blue or cream, not red) containing a horizontally scrollable row of product cards with pricing tier badges instead of star-rating emphasis.
7. **Popular Categories block**: pill-style tab row (single blue/grey/cream palette, differentiated by fill vs. outline rather than multiple hues) above a dense 4-column icon+label grid of departments.
8. **Explore/editorial tile row**: 4 image tiles with caption + "Learn More", used for case studies, project guides, or community/sustainability stories.
9. **Recommended-products grid**: 2–3 column grid of product cards (image, name, SKU, contract price with list-price strike-through where applicable, stock indicator) with "Add to Order" button — direct analog of Lowe's recommended grid, B2B-labeled.
10. **Sponsored/quick-filter carousel**: filter-pill row (category quick filters) above a horizontally scrollable product-card rail, same card component as #9.
11. Trust/utility strip and footer (see below).

### Category / Listing Pages
- Left-rail facets (desktop) / collapsible filter drawer (mobile): brand, attribute, price range, availability — Lowe's pattern.
- Sortable grid of product cards: consistent aspect-ratio image, name, SKU, price (or "Sign in for pricing" for gated B2B pricing), stock/availability indicator, quantity selector + add-to-order action.
- Sticky filter/sort bar on scroll for long listings.

### Product Detail Page (PDP)
- Image gallery (clean neutral background, STIHL catalog style) with secondary in-use/lifestyle image where available.
- Spec table for technical attributes — grey-bordered table, zebra striping using `--color-grey-100`.
- Quantity + tiered/bulk pricing block, prominent "Add to Order" / "Request Quote" primary button in Penn State blue.
- Cross-sell/accessories carousel beneath the fold.

### Header / Navigation
Three-row stack, matching Lowe's header structure:
1. **Thin utility bar** (Penn State blue, white text): branch/location picker, account/order-status shortcuts, credit terms link — replaces Lowe's store-locator/weekly-ad bar.
2. **Primary bar** (white background): logo, branch/zip picker, large centered search input, and right-aligned account / quote-list / cart icons.
3. **Department nav row**: top-level category links (Shop All, Quotes, Deals, Resources, department names) with a mega-menu on hover/tap (STIHL pattern) — categories → subcategories, optional featured promo tile within the panel.
- Persistent account context (B2B-specific, integrated into the utility bar once authenticated): company name, price list/tier, assigned rep contact — occupies the same real-estate Lowe's uses for store/location context.

### Footer
- Full-width Penn State blue background (direct analog of Lowe's dark navy footer — the value match means this pattern needs no color adjustment, only content).
- Top utility icon row: My Account, Help Center, Order Status, Credit/Terms, Quote Requests, Branch Locator, mirroring Lowe's icon row (My Lowe's, Help Center, Order Status, Credit Center, Gift Cards, Installation Services, App).
- 4–5 link columns in white/light-grey text: Company, Account & Ordering, Customer Service, Connect With Us (+ social icons), Resources.
- Bottom bar: copyright/legal text in `--color-grey-500` on the same blue background, centered, small type — matching Lowe's bottom legal row treatment.

## 5. Components

- **Buttons**: solid Penn State blue primary; white/cream background with blue border + blue text for secondary; ghost/text buttons in grey for tertiary actions. Uppercase button labels are acceptable (common commerce convention) but keep short (2–3 words).
- **Cards**: white or cream surface, 1px `--color-grey-300` border or subtle shadow, consistent internal padding, image on top, content stack below.
- **Badges/tags**: e.g. "In Stock", "Contract Item", "New" — small pill, grey or blue background per semantic meaning, never the warning/error colors for neutral labels. A "Save X%"-style promotional badge (as seen on Lowe's product cards) is permitted but rendered as a muted `--color-error` outline pill rather than Lowe's solid red fill, so it reads as one-of-many semantic states rather than a second brand color.
- **Category pill/tab row** (Popular Categories block): rendered as filled-vs-outline variants of blue/grey/cream rather than Lowe's multi-hue tab set (red/grey/light-blue/blue), so the row stays within palette while still giving each tab visual distinction.
- **Tables**: grey-ruled, zebra striping, right-aligned numeric columns (price, qty, SKU where numeric).
- **Forms**: grey-bordered inputs, blue focus ring, clear inline validation using `--color-error`/`--color-success`.

## 6. Imagery Guidance

- Homepage/campaign: lifestyle/action photography (people using products), consistent with STIHL's outdoor action-shot style, color-graded to sit comfortably against the blue/cream/grey palette (avoid oversaturated competing hues in hero imagery selection where possible).
- Catalog/PDP: clean, neutral (white or light grey) background product photography for consistency and fast scanning, per Lowe's/STIHL catalog conventions.
- Icons: simple line icons, single-color (grey or blue), no multi-color illustrative icon sets.

## 7. Accessibility & Responsiveness

- Maintain WCAG 2.1 AA contrast for all text/background combinations in the palette above; default to `--color-text` or `--color-grey-700` for body copy rather than lighter greys.
- Mobile-first CSS with `min-width` breakpoints at 600px/900px/1200px per project convention.
- All interactive elements (filters, mega-menu, quantity steppers) must be fully keyboard-operable and screen-reader labeled, especially for B2B users managing large bulk orders via keyboard/tab-heavy workflows.

## 8. Non-Goals

- No accent color outside Penn State blue / white / grey / cream (no orange, red-as-brand-accent, etc.) — reserve red/orange strictly for semantic error/warning states, at muted saturation.
- No decorative/serif typography — this is a utilitarian B2B catalog experience, not an editorial or luxury brand experience.
- No dark mode requirement at this stage unless separately requested.
