# B2B Tools band

A hairline-divided directory row that merchandises the storefront's B2B
capabilities (Quick Order, Negotiable Quotes, Requisition Lists, Company
Accounts). Designed to sit inside a full-bleed **Navy** section.

## Authoring (DA table)

Create a `b2b-tools` block. Add one row per capability with **three cells**:

| b2b-tools |               |                                                        |
| --------- | ------------- | ------------------------------------------------------ |
| quick-order | [Quick Order](/quick-order) | Add products straight to cart by SKU or paste a list. |
| quote       | [Negotiable Quotes](/customer/negotiable-quote) | Request pricing on large orders and turn a quote into a cart. |
| list        | [Requisition Lists](/customer/requisition-lists) | Save the items your crews reorder and add a whole list at once. |
| company     | [Company Accounts](/customer/company) | Manage buyers, roles, and approval rules across your org. |

- **Cell 1 — icon key:** one of `quick-order`, `quote`, `list`, `company`
  (any other value renders a generic mark).
- **Cell 2 — title:** make it a link; the link target becomes the tool's link.
- **Cell 3 — description:** one short line.

## Placement

The block **applies the navy band to its own section automatically** (it adds
the `navy` section style), so authors don't need to set Section Metadata. Just
place it in its own section, ideally with an `h2` heading above it for the band
title.

## Notes

- Icons are drawn inline (no icon-font / emoji dependency), stroked in the
  reserved Torch Orange accent.
- Layout: 4 columns (desktop) → 2 (tablet) → 1 (mobile), divided by hairlines.
