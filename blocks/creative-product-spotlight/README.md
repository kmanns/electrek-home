# Creative Product Spotlight Block

## Overview

A shoppable campaign spotlight produced by the **Creative Commerce Studio** Workspace plugin. It shows an approved product visual (separate desktop and mobile renditions made by Firefly Creative Production and delivered from Product Visuals / AEM Assets) next to editable HTML campaign copy and a CTA to the product detail page.

The SKU is a live product reference: the CTA destination is resolved from the storefront catalog at runtime, never stored in the content.

## Integration

### Block Configuration

Two-column key/value table. Row labels are case-insensitive.

| Key | Required | Description |
|-----|----------|-------------|
| `SKU` | yes | Catalog SKU, e.g. `STIHL-BGA200` |
| `Headline` | recommended | Rendered as `h2` |
| `Description` | no | Rich text (paragraphs/emphasis kept; links removed) |
| `Desktop image` | recommended | `https` URL, link or image (shown at ≥900px) |
| `Mobile image` | recommended | `https` URL, link or image (shown below 900px) |
| `Image alt` | recommended | Alt text; leave empty only if decorative |
| `CTA label` | no | Defaults to "Shop now" |
| `Presentation` | no | `static` (default) or `animated` |

Example:

```
| Creative Product Spotlight |                                   |
|----------------------------|-----------------------------------|
| SKU                        | STIHL-BGA200                      |
| Headline                   | Clear the yard in half the time   |
| Description                | Quiet battery power for pros.     |
| Desktop image              | https://delivery-…/as/desktop.jpg |
| Mobile image               | https://delivery-…/as/mobile.jpg  |
| Image alt                  | BGA 200 blower on a stone patio   |
| CTA label                  | Shop this blower                  |
| Presentation               | animated                          |
```

### URL Parameters

None.

### Local Storage

None.

### Events

None emitted or consumed. The product lookup uses the shared catalog client (`CS_FETCH_GRAPHQL` from `scripts/commerce.js`), so it uses the same store view and price-book headers as the rest of the storefront.

## Behavior Patterns

### Page Context Detection

None; the SKU comes from the block.

### Layout Behavior

- Mobile: image stacked above the copy.
- Desktop (≥900px): image 60% / copy 40%.
- Images are never cropped: each `<source>` carries its own width/height (default rendition sizes 1200×896 desktop, 896×1200 mobile) so space is reserved before load and the real aspect ratio wins.
- AEM Assets delivery URLs (`*.adobeaemcloud.com/adobe/assets/…`) are requested at 900/1600px widths as WebP with the original format as a fallback. Other URLs are used as authored.
- `animated`: one entrance of about 1.3 s when the block scrolls into view. The image slides in from the left (0.9 s), then the headline, description and CTA rise in at 0.25 s, 0.4 s and 0.6 s. After that the composition stays still; nothing loops. Only `transform` and `opacity` are animated. With `prefers-reduced-motion: reduce` nothing animates, and content stays visible if JavaScript or IntersectionObserver is unavailable.

### Error Handling

- **Unknown SKU / lookup failure**: the image and copy remain; the CTA is hidden, so there is never a link to a product that does not exist. `data-product-status` is set to `not-found` or `error` for debugging.
- **Missing images**: copy-only layout (`no-media`).
- **Unsafe URLs**: only `https:` (or same-origin) image URLs are accepted.
