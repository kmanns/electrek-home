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

- **Cell 1 — image:** the tile thumbnail (16:9 crop). Insert it with the AEM
  Assets picker or any image; the authored `<picture>` is used as-is.
- **Cell 2 — label:** a link; its text is the department name and its href is
  the tile's destination (category page / PLP).

## Live categories + authored images

The tile list (names, links, order) comes live from **Catalog Service**
(Adobe Commerce Optimizer) `categoryTree` — top-level categories, or the
children of the optional `root` config slug. Authored rows supply the images:

- A row is matched to a category by its **label** (case/punctuation-insensitive,
  `&` = "and"), then by the **last path segment of its link** (e.g.
  `/lawn-mowers`).
- **Image priority:** authored image → catalog `BASE` image → empty tile.
- Rows that match no catalog category are **ignored** while the catalog is
  reachable.
- If the catalog fetch fails or returns nothing, the authored rows render
  exactly as written.

## Layout

3 columns (desktop) → 2 (tablet) → 1 (mobile).
