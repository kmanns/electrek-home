# Category grid

An aisle-directory grid of department tiles (image + label linking to the
category/PLP). Firm-bordered tiles with a torch-accent hover rule.

## Authoring (DA table)

Create a `category-grid` block. Add one row per department, **two cells**:

| category-grid |                              |
| ------------- | ---------------------------- |
| ![](power-tools.jpg)   | [Power Tools](/power-tools)          |
| ![](hand-tools.jpg)    | [Hand Tools](/hand-tools)            |
| ![](fasteners.jpg)     | [Hardware & Fasteners](/hardware)    |
| ![](electrical.jpg)    | [Electrical](/electrical)            |
| ![](plumbing.jpg)      | [Plumbing](/plumbing)                |
| ![](safety.jpg)        | [Safety & Workwear](/safety)         |

- **Cell 1 — image:** the tile thumbnail (16:9 crop).
- **Cell 2 — label:** a link; its text is the department name and its href is
  the tile's destination (category page / PLP).

## Dynamic (future)

`category-grid.js` builds tiles from `[...block.children]` today. To source
tiles live from **Catalog Service** (Adobe Commerce Optimizer), replace the
tile-collection step with a `CS_FETCH_GRAPHQL.fetchGraphQl(<categories query>)`
call keyed off the configured `rootCategory` (`config.json →
plugins.picker.rootCategory`). Verify the exact query against the live catalog
before shipping — it could not be verified in the local dev environment.

## Layout

3 columns (desktop) → 2 (tablet) → 1 (mobile).
