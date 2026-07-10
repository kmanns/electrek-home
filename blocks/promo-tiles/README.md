# Promo Tiles Block

## Overview

Displays a row of equal-width image tiles with a dark blue gradient overlay and short heading/link text, used directly below the homepage hero for sub-category or seasonal-program promotion (see DESIGN.md "5-up promo tile row").

## Integration

### Block Configuration

This block does not require any configuration parameters. Content is defined directly in the block structure.

### Block Structure

Each row becomes one tile:
- First column: Image — styled as `promo-tiles-tile-image`
- Second column: Heading + link text — styled as `promo-tiles-tile-content`, overlaid on the image

Example authoring structure:
```
| Image | Content |
|-------|---------|
| ![Category 1](image1.jpg) | ### Category Name \n [Shop Now](/category-1) |
```

## Behavior Patterns

### Layout Behavior

- **Responsive grid**: 2-up (mobile) → 3-up (tablet, 600px+) → 5-up (desktop, 900px+)
- **Overlay**: dark Penn State blue gradient (not black) applied via CSS, text sits at the bottom of each tile

### Error Handling

- **Missing image**: tile renders with content only, no gradient overlay backdrop
