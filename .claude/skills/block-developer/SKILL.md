---
name: block-developer
description: Develops and customizes EDS blocks for Adobe Commerce storefronts. Use when implementing block decorators, DOM manipulation, event handling, CSS styling, or creating new blocks.
---

# Block Developer Skill

## Purpose

Develop and customize EDS blocks for the Adobe Commerce storefront, including DOM manipulation, event handling, styling, and testing.

---

## MANDATORY Skill Handoff: Drop-in Developer

**CRITICAL: This is NOT optional.** You **MUST** invoke the **Drop-in Developer skill** whenever the task involves drop-in components or their API — even if the task appears simple or you believe you already know how to do it. **NEVER** attempt to implement drop-in work yourself without invoking the Drop-in Developer skill first. No exceptions.

This applies to **any** of the following, regardless of complexity:

- Rendering drop-in **containers** (e.g., `provider(ContainerName, { ... })(element)`)
- Customizing drop-in **slots** (e.g., `slots: { SlotName: (ctx) => { ... } }`)
- Subscribing to or handling drop-in **events** via the event bus (e.g., `events.on(...)`)
- Calling drop-in **API functions** (e.g., imports from `@dropins/*/api.js`)
- Styling drop-ins with **CSS custom properties / design tokens**
- Working with drop-in **TypeScript definitions** in `node_modules/@dropins/`

**How to apply this rule:** If the block you are building or modifying composes drop-in components or calls their API, you **MUST** delegate all drop-in integration work to the **Drop-in Developer skill**. Focus the Block Developer skill on the surrounding block structure, layout, and non-drop-in DOM logic only. Do not inline drop-in logic yourself — always hand off.

---

## Pre-Implementation Checklist

### MANDATORY: Block Reusability Check

Before implementing ANY block, check existing solutions first.

**NEVER** start implementing a block until you've checked:
1. Current project blocks in `/blocks` directory

Use the **Researcher skill** (Codebase Search section) to systematically search for existing blocks and patterns.

### Workflow

#### Step 1: Check current project blocks

Use the **Researcher skill** to search the project's `/blocks` directory:
* Similar blocks already implemented?
* Related functionality to adapt?
* Patterns you can reuse?

#### Step 2: Evaluate findings

After checking:
* **If exact match exists** → Use it as-is
* **If close match exists (80%+ of requirements)** → Adapt it
* **If related pattern exists** → Use as template
* **If nothing relevant exists** → Build from scratch + document why

#### Building from Scratch

**BEFORE** Building from scratch, you must document why it is needed.

This documentation:
* Proves you checked first
* Explains decision to reviewers
* Helps future developers understand choices

Example:
```
Building new because: [specific reason existing solutions don't work]
```

---

## Block Fundamentals

### Block Structure

Every block consists of:
- **JavaScript file**: `blocks/blockname/blockname.js` - Decoration logic
- **CSS file**: `blocks/blockname/blockname.css` - Scoped styles
- **Content**: HTML structure delivered by AEM backend

### The Decorate Function

```javascript
/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default async function decorate(block) {
  // 1. Load dependencies (if needed)
  // 2. Extract configuration from block (if applicable)
  // 3. Transform DOM
  // 4. Add event listeners
  // 5. Set loaded status (if needed)
}
```

**This function is called automatically** by the AEM page loading system when the block is encountered.

---

## Inspecting Block HTML

**ALWAYS inspect the HTML before writing code.** Don't make assumptions.

### Methods to Inspect

**1. Local curl (fastest)**
```bash
# View full page HTML
curl http://localhost:3000/path/to/test-page

# View page as plain.html (stripped to content only)
curl http://localhost:3000/path/to/test-page.plain.html
```

**2. Browser console**
```javascript
// Log the block element
console.log(block);

// Log the HTML structure
console.log(block.outerHTML);

// Log all rows
console.log([...block.children]);
```

**3. Preview environment**
```bash
# View from preview environment
curl https://branch--repo--owner.aem.page/path/to/test-page.plain.html
```

### Understanding Block HTML Structure

AEM converts authored tables into HTML with this structure:

**Authored content:**
```
| Block Name |
|------------|
| value1 | value2 | value3 |
| value4 | value5 | value6 |
```

**Delivered HTML:**
```html
<div class="block-name">
  <div>
    <div>value1</div>
    <div>value2</div>
    <div>value3</div>
  </div>
  <div>
    <div>value4</div>
    <div>value5</div>
    <div>value6</div>
  </div>
</div>
```

**Key observations:**
- Block name becomes `class="block-name"` (lowercase, spaces to hyphens)
- Each table row becomes a `<div>` containing child `<div>`s
- Each table cell becomes a `<div>`
- Images become `<picture>` elements with `<img>` inside
- Links become `<a>` elements
- Text content is preserved with semantic HTML (paragraphs, headings, lists, etc.)

---

## DOM Manipulation Patterns

### Reading Block Structure

**Get all rows:**
```javascript
const rows = [...block.children];
```

**Get cells from a row:**
```javascript
const cells = [...row.children];
```

**Get specific row/cell:**
```javascript
const firstRow = block.children[0];
const firstCell = firstRow.children[0];
```

**Get text content:**
```javascript
const text = cell.textContent.trim();
```

**Get image:**
```javascript
const picture = cell.querySelector('picture');
const img = cell.querySelector('img');
```

**Get link:**
```javascript
const link = cell.querySelector('a');
const href = link?.href;
const linkText = link?.textContent;
```

### Common Transformation Patterns

**Pattern 1: Simple row iteration**
```javascript
export default async function decorate(block) {
  const rows = [...block.children];

  rows.forEach((row) => {
    const cells = [...row.children];
    // Transform each row
    row.classList.add('item');
  });
}
```

**Pattern 2: Extract configuration from first row**
```javascript
export default async function decorate(block) {
  const config = {};
  const configRow = block.children[0];
  const cells = [...configRow.children];

  // First cell = key, second = value (config block pattern)
  config[cells[0].textContent.trim()] = cells[1].textContent.trim();

  configRow.remove(); // Remove config row after extraction

  // Process remaining rows
  [...block.children].forEach((row) => {
    // Use config to influence decoration
  });
}
```

**Pattern 3: Rebuild DOM structure**
```javascript
export default async function decorate(block) {
  const rows = [...block.children];

  // Create new structure
  const container = document.createElement('div');
  container.classList.add('container');

  rows.forEach((row) => {
    const cells = [...row.children];

    // Build new element from cell data
    const item = document.createElement('div');
    item.classList.add('item');

    const img = cells[0].querySelector('img');
    if (img) item.append(img);

    const text = cells[1].textContent.trim();
    const p = document.createElement('p');
    p.textContent = text;
    item.append(p);

    container.append(item);
  });

  // Replace block contents
  block.textContent = '';
  block.append(container);
}
```

**Pattern 4: Handle optional fields gracefully**
```javascript
export default async function decorate(block) {
  const rows = [...block.children];

  rows.forEach((row) => {
    const cells = [...row.children];

    // Required field
    const title = cells[0]?.textContent.trim();
    if (!title) return; // Skip malformed rows

    // Optional fields - check existence
    const img = cells[1]?.querySelector('img');
    const link = cells[2]?.querySelector('a');

    // Build element, include optional parts only if present
    const item = document.createElement('div');
    if (img) item.append(img.cloneNode(true));

    const heading = document.createElement('h3');
    heading.textContent = title;

    if (link) {
      link.textContent = '';
      link.append(heading);
      item.append(link);
    } else {
      item.append(heading);
    }

    row.replaceWith(item);
  });
}
```

### Working with Images

**Get optimized image:**
```javascript
const picture = cell.querySelector('picture');
const img = cell.querySelector('img');

// Images from AEM are already optimized with:
// - Multiple source formats (webp, etc.)
// - Responsive srcset
// - Lazy loading attributes

// Just move/clone the picture element:
newElement.append(picture);
```

**Modify image attributes:**
```javascript
const img = cell.querySelector('img');
if (img) {
  img.alt = 'Descriptive alt text';
  img.loading = 'lazy'; // Usually already set
}
```

### Working with Links

**Extract link data:**
```javascript
const link = cell.querySelector('a');
if (link) {
  const href = link.href;
  const text = link.textContent.trim();
  const title = link.title;
}
```

**Wrap content in link:**
```javascript
const link = cell.querySelector('a');
if (link) {
  const href = link.href;
  link.textContent = ''; // Clear existing content
  link.append(newContent); // Add new content
}
```

**Create new link:**
```javascript
const a = document.createElement('a');
a.href = url;
a.textContent = 'Click here';
a.title = 'Descriptive title';
```

### Working with Rich Content

**Get formatted content (preserving HTML):**
```javascript
// Cell may contain paragraphs, headings, lists, etc.
const content = cell.innerHTML;

// Or clone the content
const contentClone = cell.cloneNode(true);
newElement.append(contentClone);
```

**Get plain text (stripping HTML):**
```javascript
const plainText = cell.textContent.trim();
```

---

## Block Variants

Variants modify block behavior without changing the JavaScript file.

**Authored:**
```
| Block Name (Variant1, Variant2) |
|---------------------------------|
| content |
```

**Delivered HTML:**
```html
<div class="block-name variant1 variant2">
  <div>content</div>
</div>
```

**Detect variants in JavaScript:**
```javascript
export default async function decorate(block) {
  const isVariant1 = block.classList.contains('variant1');
  const isVariant2 = block.classList.contains('variant2');

  if (isVariant1) {
    // Apply variant1-specific behavior
  }

  if (isVariant2) {
    // Apply variant2-specific behavior
  }
}
```

**CSS for variants:**
```css
/* Base block styles */
.block-name {
  /* Default styles */
}

/* Variant-specific styles */
.block-name.variant1 {
  /* Override for variant1 */
}

.block-name.variant2 {
  /* Override for variant2 */
}
```

---

## CSS Scoping Rules

**CRITICAL: All CSS selectors MUST be scoped to the block class.**

This prevents style conflicts between blocks and ensures maintainability.

### ❌ Wrong - Unscoped Selectors

```css
.search-input {
  padding: 1rem;
}

.item-label {
  font-weight: bold;
}
```

**Problem:** These selectors will match ANY element with these classes across the entire page, causing conflicts.

### ✅ Correct - Fully Scoped Selectors

```css
.block-name .search-input {
  padding: 1rem;
}

.block-name .item-label {
  font-weight: bold;
}

/* For elements you create dynamically */
.block-name input {
  padding: 1rem;
}
```

**Why this matters:**
- Prevents conflicts with other blocks
- Makes CSS predictable and maintainable
- Follows CSS specificity best practices
- Essential for composable architecture

**Rule:** Every selector must start with `.block-name` (your block's class).

---

## Async Operations and Loading

### Loading External Dependencies

**Load library (if absolutely necessary):**
```javascript
export default async function decorate(block) {
  // Only if truly needed - avoid dependencies when possible
  const lib = await import('./lib.js');

  // Use library
  lib.doSomething(block);
}
```

### Fetching Data

**Fetch JSON data:**
```javascript
export default async function decorate(block) {
  const endpoint = block.querySelector('a')?.href;

  if (endpoint) {
    try {
      const response = await fetch(endpoint);
      const data = await response.json();

      // Use data to populate block
      data.items.forEach((item) => {
        // Create elements from data
      });
    } catch (error) {
      console.error('Failed to load data:', error);
      // Show error state or fallback
    }
  }
}
```

### Loading State

**Add loading indicator:**
```javascript
export default async function decorate(block) {
  // Add loading class
  block.classList.add('loading');

  // Perform async operation
  await doSomethingAsync();

  // Remove loading class
  block.classList.remove('loading');
  block.classList.add('loaded');
}
```

**CSS for loading state:**
```css
.block-name.loading {
  opacity: 0.5;
  pointer-events: none;
}

.block-name.loading::after {
  content: 'Loading...';
  display: block;
}
```

---

## Event Handlers

### Adding Event Listeners

**Click events:**
```javascript
export default async function decorate(block) {
  const button = block.querySelector('.button');

  button.addEventListener('click', (e) => {
    e.preventDefault();
    // Handle click
  });
}
```

**Event delegation (for dynamic content):**
```javascript
export default async function decorate(block) {
  block.addEventListener('click', (e) => {
    const button = e.target.closest('.button');
    if (button) {
      e.preventDefault();
      // Handle button click
    }
  });
}
```

**Keyboard accessibility:**
```javascript
button.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    // Handle activation
  }
});
```

---

## Responsive Design

### Mobile-First Approach

**CSS breakpoints:**
```css
/* Mobile styles (default) */
.block-name {
  display: block;
}

/* Tablet (600px+) */
@media (min-width: 600px) {
  .block-name {
    display: flex;
  }
}

/* Desktop (900px+) */
@media (min-width: 900px) {
  .block-name {
    max-width: 1200px;
  }
}

/* Large desktop (1200px+) */
@media (min-width: 1200px) {
  .block-name {
    /* Large screen styles */
  }
}
```

### JavaScript for Responsive Behavior

**Detect viewport size (if necessary):**
```javascript
export default async function decorate(block) {
  const isMobile = window.matchMedia('(max-width: 599px)').matches;
  const isTablet = window.matchMedia('(min-width: 600px) and (max-width: 899px)').matches;
  const isDesktop = window.matchMedia('(min-width: 900px)').matches;

  // Apply behavior based on viewport
  if (isMobile) {
    // Mobile-specific behavior
  }
}
```

**Listen for viewport changes:**
```javascript
const mediaQuery = window.matchMedia('(min-width: 900px)');

function handleViewportChange(e) {
  if (e.matches) {
    // Desktop behavior
  } else {
    // Mobile/tablet behavior
  }
}

mediaQuery.addEventListener('change', handleViewportChange);
handleViewportChange(mediaQuery); // Initial check
```

---

## Accessibility

### ARIA Labels and Roles

**Add ARIA attributes:**
```javascript
const button = document.createElement('button');
button.setAttribute('aria-label', 'Close dialog');
button.setAttribute('aria-expanded', 'false');
```

**For custom interactive elements:**
```javascript
const customButton = document.createElement('div');
customButton.setAttribute('role', 'button');
customButton.setAttribute('tabindex', '0');
customButton.addEventListener('click', handleClick);
customButton.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    handleClick();
  }
});
```

### Focus Management

**Manage focus for interactive elements:**
```javascript
const dialog = document.createElement('div');
dialog.setAttribute('role', 'dialog');
dialog.setAttribute('aria-modal', 'true');

// When opening dialog
dialog.style.display = 'block';
dialog.querySelector('button').focus();

// Trap focus within dialog
dialog.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    // Trap focus logic
  }
});
```

---

## Performance Considerations

### Minimize DOM Operations

**Bad - multiple reflows:**
```javascript
// ❌ WRONG - causes multiple reflows
rows.forEach((row) => {
  row.style.width = '100px';
  row.style.height = '50px';
  row.classList.add('item');
});
```

**Good - batch operations:**
```javascript
// ✅ CORRECT - minimize reflows
const fragment = document.createDocumentFragment();

rows.forEach((row) => {
  row.style.cssText = 'width: 100px; height: 50px';
  row.classList.add('item');
  fragment.append(row);
});

block.append(fragment);
```

### Lazy Loading

**Lazy load images (usually already handled by AEM):**
```javascript
const img = cell.querySelector('img');
if (img && !img.loading) {
  img.loading = 'lazy';
}
```

**Lazy load functionality:**
```javascript
export default async function decorate(block) {
  // Set up structure immediately
  block.classList.add('ready');

  // Lazy load expensive operations
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        // Load expensive functionality when visible
        loadExpensiveFeature(block);
        observer.disconnect();
      }
    });
  });

  observer.observe(block);
}
```

### Avoid Dependencies

**Prefer vanilla JavaScript over libraries:**
```javascript
// ❌ WRONG - unnecessary dependency
import $ from 'jquery';
$('.block-name').addClass('active');

// ✅ CORRECT - vanilla JS
document.querySelectorAll('.block-name').forEach((el) => {
  el.classList.add('active');
});
```

**Use native browser APIs:**
```javascript
// Native fetch instead of axios
fetch(url).then(r => r.json()).then(data => { /* ... */ });

// Native DOM manipulation instead of jQuery
element.classList.add('class');
element.addEventListener('click', handler);
```

---

## Testing Your Block

### Local Testing

1. **Create test content** in `drafts/agent/blockname-test.html`
  - **ALWAYS** read head.html first and copy the exact script/style tags from it
  - Include the entire content of `head.html` into this file to load the necessary global scripts and style sheets.
  - Include aem.js and scripts.js - these handle block decoration
  - Without these scripts, your block JavaScript never runs
  - The nonce="aem" attribute is typically required for CSP (Content Security Policy)
  - Use the decorated HTML structure (nested divs) that blocks receive, NOT tables
  - Tables are authored in Word/Google Docs, but AEM converts them to nested divs before blocks run
  - Block class comes from table name (e.g., "Block Name" → "block-name")
  - Each table row becomes a div containing child divs for each cell
2. **Start server** with HTML folder: `aem up --html-folder=./drafts/agent`
3. **Test at** `http://localhost:3000/drafts/agent/blockname-test`
4. **Use browser DevTools** to inspect and debug

### Console Debugging

```javascript
export default async function decorate(block) {
  console.log('Block element:', block);
  console.log('Block HTML:', block.outerHTML);
  console.log('Rows:', [...block.children]);

  // Your decoration code
}
```

### Responsive Testing

- Use browser DevTools device emulation
- Test at 599px (mobile), 600px (tablet), 900px (desktop), 1200px+ (large)
- Test with Puppeteer/Playwright if available

---

## Common Mistakes to Avoid

### ❌ Assuming Field Presence

**Wrong:**
```javascript
const title = row.children[1].textContent; // Crashes if cell doesn't exist
```

**Correct:**
```javascript
const title = row.children[1]?.textContent.trim() || 'Default';
```

### ❌ Modifying Original Elements Destructively

**Wrong:**
```javascript
const img = cell.querySelector('img');
cell.innerHTML = ''; // Destroys the image
// Now img is detached from DOM
```

**Correct:**
```javascript
const img = cell.querySelector('img');
const imgClone = img.cloneNode(true); // Or move it before clearing
cell.innerHTML = '';
cell.append(imgClone);
```

### ❌ Not Handling Empty Blocks

**Wrong:**
```javascript
export default async function decorate(block) {
  const firstRow = block.children[0]; // Crashes if no rows
  const title = firstRow.children[0].textContent;
}
```

**Correct:**
```javascript
export default async function decorate(block) {
  if (!block.children.length) return; // Handle empty block

  const firstRow = block.children[0];
  if (!firstRow?.children.length) return; // Handle empty row

  const title = firstRow.children[0]?.textContent.trim();
}
```

### ❌ Using Dropin Specific Function Outside Dropin Slot Context

**Wrong:**
```javascript
// Function expects specific, unmodified context object only provided by slots
tryRenderAemAssetsImage(
      {  // Crashes due to incorrect object type
        data: { sku },
        defaultImageProps: {
          src: mainImage.url,
          alt: name,
          width: 400,
          height: 400,
        },
      },
      // ...
    );
```

**Correct:**
```javascript
// Native DOM element used to create UI in blocks
const img = document.createElement('img');
    img.src = mainImage.url;
    img.alt = name;
    img.width = 400;
    img.height = 400;
    img.loading = 'eager';
```

---

## Quick Reference

### DOM Traversal
```javascript
[...block.children]              // All rows
[...row.children]                // All cells in row
cell.querySelector('img')        // Find image
cell.querySelector('a')          // Find link
cell.querySelector('picture')    // Find picture element
cell.textContent.trim()          // Get text content
```

### DOM Creation
```javascript
document.createElement('div')
element.classList.add('class')
element.setAttribute('attr', 'value')
element.append(child)
element.textContent = 'text'
element.innerHTML = '<p>html</p>'
```

### Common Operations
```javascript
element.remove()                 // Remove from DOM
element.replaceWith(newElement)  // Replace element
element.cloneNode(true)          // Deep clone
block.textContent = ''           // Clear contents
```

---

## Block Development Workflow Summary

1. **Inspect the HTML** - Use curl/console.log, don't assume
2. **Handle variations gracefully** - Authors will omit/add fields
3. **Transform the DOM** - Extract data, rebuild structure
4. **Add interactivity** - Event listeners, ARIA attributes
5. **Style responsively** - Mobile-first CSS with breakpoints
6. **Test thoroughly** - Local HTML, responsive, accessibility