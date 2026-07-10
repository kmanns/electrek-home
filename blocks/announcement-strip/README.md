# Announcement Strip Block

## Overview

Full-width single-line banner for account-wide messaging (e.g. "Free freight on orders over $500 for contract accounts"), rendered in Penn State blue with white text (see DESIGN.md "Full-width announcement strip").

## Integration

### Block Configuration

This block does not require any configuration parameters. Content is defined directly in the block structure.

### Block Structure

A single row:
- First column: optional icon image — styled as `announcement-strip-icon`
- Second column: statement text + optional link — styled as `announcement-strip-text`

Example authoring structure:
```
| Icon | Message |
|------|---------|
| ![Truck](icon.svg) | **Free freight** on orders over $500 for contract accounts. [Learn more](/shipping) |
```

## Behavior Patterns

### Layout Behavior

- Single centered row, wraps to multiple lines on narrow viewports
- Icon column is optional — if omitted, text centers on its own
