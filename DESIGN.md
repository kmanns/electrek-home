---
# Target visual system — B2B home-improvement storefront (rebrand)
# Authored by stardust:direct 2026-09-04. OKLCH values are source of truth; hex in comments for reference.
colors:
  # Structure — Penn State Blue
  navy:        "oklch(0.240 0.076 257.2)"   # #041E42 Foundry Navy — header/nav/footer/banners
  navy-800:    "oklch(0.289 0.086 257.3)"   # #0A2A55 — hover/elevated navy
  navy-600:    "oklch(0.370 0.100 256.8)"   # #183F73 — links, secondary structure
  # Ground — cream
  cream:       "oklch(0.953 0.020 87.5)"    # #F5EFE1 Millpaper Cream — page ground
  cream-200:   "oklch(0.926 0.024 88.2)"    # #EDE6D5 — surface/cards on cream
  paper:       "oklch(0.980 0.010 87.5)"    # #FBF8F1 — cards on navy sections
  # Ink — near-black (no pure black)
  ink:         "oklch(0.209 0.010 268.2)"   # #16181D — body text
  # Grey — warm neutral scale
  grey-700:    "oklch(0.408 0.008 97.5)"    # #4B4A45 — secondary text
  grey-500:    "oklch(0.621 0.015 88.7)"    # #8A867C — muted/meta
  grey-300:    "oklch(0.815 0.017 88.0)"    # #C7C2B6 — borders/dividers
  # Accent — reserved warm
  torch:       "oklch(0.630 0.177 42.4)"    # #DD5B1A Torch Orange — badges, non-text accents, hover glow
  torch-600:   "oklch(0.570 0.162 42.5)"    # #C24E12 — primary CTA fill (white text, AA)
typography:
  displayFamily: "'Barlow Condensed', 'Oswald', system-ui, sans-serif"   # signage headings
  headingFamily: "'Barlow Condensed', system-ui, sans-serif"
  bodyFamily:    "'Barlow', 'Inter', system-ui, sans-serif"
  scale: 1.2   # minor-third, product/packed register
  base: "16px"
  weights: { display: 700, heading: 600, body: 400, bodyStrong: 600 }
rounded:
  primary: "4px"     # tooled, hardware-sharp
  small:   "2px"
  pill:    "999px"   # only for status/stock chips
spacing:
  base: "4pt"
  sectionPadding: { desktop: "48px", tablet: "36px", mobile: "24px" }   # packed (product register)
components:
  - ds-button-primary
  - ds-button-secondary
  - ds-product-card
  - ds-badge
  - ds-input
  - ds-section-banner
---

# DESIGN — Target

## 1. Overview
A rugged, high-contrast B2B home-improvement storefront. **Penn State Blue (Foundry Navy)** builds the structure — dark header, dark banded section banners, dark footer — over a warm **cream** working ground that keeps a dense catalog from feeling clinical. **Torch Orange** is the single hot accent, reserved for primary CTAs, stock/sale badges, and active states. Type is signage-grade: condensed **Barlow Condensed** headings over legible **Barlow** body. Small tooled radii (2–4px) and firm warm-grey borders read as hardware, not consumer-DTC. North star: *aisle-signage clarity for people who buy for a living.*

## 2. Color
- **Structure:** `navy` `#041E42` carries chrome and banded section banners; `navy-800`/`navy-600` for elevation and links.
- **Ground:** `cream` `#F5EFE1` is the page; `cream-200` for cards/surfaces on cream; `paper` for cards sitting on navy sections.
- **Text:** `ink` `#16181D` body; `grey-700` secondary; `grey-500` meta/muted.
- **Borders:** `grey-300` `#C7C2B6`.
- **Accent (reserved):** `torch` `#DD5B1A` for badges + non-text accents + hover glow; `torch-600` `#C24E12` for primary CTA fills so white button text clears WCAG AA (≥4.5:1). Torch never decorates and never appears as long-form text.

Contrast: navy-on-cream and ink-on-cream far exceed AA; torch-600 + white passes AA at button sizes.

## 3. Typography
- **Display / Headings:** Barlow Condensed. Condensed, confident, signage-like. Uppercase permitted for eyebrows, section banners, and short CTAs; mixed-case for multi-word headings.
- **Body:** Barlow, 16px base, 1.5 line-height.
- **Scale (1.2, minor third):** body 16 · h4 19 · h3 23 · h2 28 · h1 33 · display 40–56 (condensed allows large sizes without breaking density).
- Self-hostable via Google Fonts (both are open-license), consistent with EDS font-loading.

## 4. Spacing & Layout
Packed product-register rhythm: section padding 48/36/24 (desktop/tablet/mobile). 4pt base scale. Banded layout — alternating cream and navy full-bleed section banners (Stihl silhouette). Product grids are firm and gridded, not floating cards.

## 5. Motifs
- **Section banners:** full-bleed navy bands with cream/condensed headings and a torch eyebrow rule.
- **Tooled corners:** 4px primary radius, 2px on inputs/small controls; 999px only on stock/status chips.
- **Firm borders:** 1px `grey-300` on cards, inputs, and dividers — structural, not shadowed. Shadows are minimal (a single low `0 1px 2px rgba(20,24,29,.12)`); no soft floating cards.
- **Badge system:** torch-filled badges for "Sale", "In stock", "Bulk"; navy-outline badges for spec tags.

## 6. Components

### ds-button-primary
Solid torch-600 fill, white label, tooled 4px corners; primary "Add to Cart" / "Request Quote".
```html
<button class="ds-button-primary">Add to Cart</button>
```
```css
.ds-button-primary{
  background: oklch(0.570 0.162 42.5); color: oklch(0.980 0.010 87.5);
  font-family:'Barlow Condensed',system-ui,sans-serif; font-weight:600;
  text-transform:uppercase; letter-spacing:.02em; font-size:16px;
  padding:12px 22px; border:0; border-radius:4px; cursor:pointer;
}
.ds-button-primary:hover{ background: oklch(0.630 0.177 42.4); }
```

### ds-button-secondary
Navy-outline on cream; secondary actions ("View details", "Compare").
```html
<button class="ds-button-secondary">View Details</button>
```
```css
.ds-button-secondary{
  background:transparent; color: oklch(0.240 0.076 257.2);
  font-family:'Barlow Condensed',system-ui,sans-serif; font-weight:600;
  text-transform:uppercase; letter-spacing:.02em; font-size:16px;
  padding:11px 21px; border:1.5px solid oklch(0.240 0.076 257.2); border-radius:4px; cursor:pointer;
}
.ds-button-secondary:hover{ background: oklch(0.240 0.076 257.2); color: oklch(0.980 0.010 87.5); }
```

### ds-product-card
Firm-bordered, minimal-shadow catalog card on cream.
```html
<article class="ds-product-card">
  <span class="ds-badge ds-badge--stock">In stock</span>
  <img src="…" alt="…">
  <h3>Cordless Impact Driver</h3>
  <p class="ds-sku">SKU 4820-22</p>
  <p class="ds-price">$189.00</p>
  <button class="ds-button-primary">Add to Cart</button>
</article>
```
```css
.ds-product-card{
  background: oklch(0.980 0.010 87.5); border:1px solid oklch(0.815 0.017 88.0);
  border-radius:4px; padding:16px; box-shadow:0 1px 2px rgba(20,24,29,.12);
  font-family:'Barlow',system-ui,sans-serif; color: oklch(0.209 0.010 268.2);
}
.ds-product-card h3{ font-family:'Barlow Condensed',system-ui,sans-serif; font-weight:600; font-size:23px; margin:8px 0 2px; }
.ds-product-card .ds-sku{ color: oklch(0.621 0.015 88.7); font-size:13px; margin:0 0 6px; }
.ds-product-card .ds-price{ font-weight:600; font-size:19px; margin:0 0 12px; }
```

### ds-badge
Torch-filled status/sale badge; navy-outline spec tag.
```css
.ds-badge{ display:inline-block; font-family:'Barlow Condensed',system-ui,sans-serif; font-weight:600;
  text-transform:uppercase; letter-spacing:.03em; font-size:12px; padding:3px 9px; border-radius:999px; }
.ds-badge--stock{ background: oklch(0.630 0.177 42.4); color:#fff; }
.ds-badge--spec{ background:transparent; color: oklch(0.240 0.076 257.2); border:1px solid oklch(0.240 0.076 257.2); }
```

### ds-input
Sharp 2px field with firm grey border, navy focus.
```css
.ds-input{ font-family:'Barlow',system-ui,sans-serif; font-size:16px; color: oklch(0.209 0.010 268.2);
  background: oklch(0.980 0.010 87.5); border:1px solid oklch(0.815 0.017 88.0); border-radius:2px; padding:10px 12px; }
.ds-input:focus{ outline:2px solid oklch(0.240 0.076 257.2); outline-offset:1px; border-color: oklch(0.240 0.076 257.2); }
```

### ds-section-banner
Full-bleed navy band (the Stihl silhouette) with cream condensed heading + torch eyebrow rule.
```css
.ds-section-banner{ background: oklch(0.240 0.076 257.2); color: oklch(0.953 0.020 87.5); padding:48px 0; }
.ds-section-banner .eyebrow{ display:inline-block; color: oklch(0.630 0.177 42.4);
  font-family:'Barlow Condensed',system-ui,sans-serif; font-weight:600; text-transform:uppercase; letter-spacing:.08em; font-size:14px;
  border-top:3px solid oklch(0.630 0.177 42.4); padding-top:6px; }
.ds-section-banner h2{ font-family:'Barlow Condensed',system-ui,sans-serif; font-weight:700; text-transform:uppercase; font-size:40px; margin:8px 0 0; }
```
