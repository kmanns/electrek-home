---
name: content-modeler
description: Designs author-friendly content structures for AEM Edge Delivery blocks. Use when planning block table structures, content vs config patterns, or optimizing for non-technical authors.
---

# Content Modeler Skill

## Purpose

Design author-friendly content structures for blocks that are intuitive for non-technical users while supporting robust implementation.

---

## Core Principle

Authors create content using various authoring surfaces: Word/Google Docs, Document Authoring (DA), Universal Editor (UE), or custom BYOM (Bring Your Own Markup) sources. Regardless of the authoring surface, they're not developers. Structure should be intuitive for non-technical users.

**Key principle:** If authors struggle with the structure, you designed it wrong.

## Goal

Design and document content structures that are author-friendly, not developer-friendly.

---

## Block Table Structure in AEM EDS

### Header Row Convention

In AEM Edge Delivery Services, block tables have a specific header structure:

**The first row is always a merged cell with the block name (and optional variants):**

```
| Carousel (Auto-Play) |
|----------------------|
| image1.jpg           |
| image2.jpg           |
| image3.jpg           |
```

**NOT like a traditional spreadsheet:**

```
❌ WRONG:
| Image | Caption | Link |
|-------|---------|------|
| img1  | Text    | URL  |
```

The block name in the header is how AEM knows which JavaScript/CSS to load. Variants in parentheses provide configuration options.

**IMPORTANT - Never add a second header row:**

❌ **WRONG - Do NOT do this:**

```
| Team Members |
|--------------|
| Image | Name | Title |    ← NEVER add this second header row!
| john.jpg | John Doe | CEO |
```

✅ **CORRECT:**

```
| Team Members |
|--------------|
| john.jpg | John Doe | CEO |    ← Data starts immediately after block name
| jane.jpg | Jane Doe | CTO |
```

Block code determines column meaning by position. Authors should never add header rows with column labels - that's an anti-pattern that breaks how AEM parses blocks.

### Using Rows vs Columns for Structure

**It's an art, not a science.** You have two dimensions to work with:

**Columns** - Good for:
- Attributes of the same item (name, title, bio for one person)
- Parallel data that appears together

**Rows** - Good for:
- Multiple items of the same type (multiple team members)
- Logical sections or groups within the block
- Sequential content

---

## Content Blocks vs Config Blocks

### Content Blocks (Preferred)

Content is directly authored by users. The block code decorates and enhances what's already there.

**Example:**

```
| Team Members |
|--------------|
| john.jpg | John Doe | CEO |
| jane.jpg | Jane Smith | CTO |
```

### Config Blocks (Use Sparingly)

Authored as key-value pairs. Used to load/display dynamic experiences, often via APIs.

**Example:**

```
| Product Feed |
|--------------|
| API Endpoint | https://... |
| Max Items | 10 |
```

### When to Use Each

**Use Content Blocks for:** Team members, features, testimonials, image galleries, article content, etc.

**Use Config Blocks ONLY for:** Actual configuration (API endpoints, feature flags, integration settings)

**Rule:** "Config blocks should only be used for config." Most blocks should be content blocks where authors create the actual content, not configuration that drives code.

---

## Advanced Techniques

### 1. Fragments (Nested Structures)

**When to use:** Complex blocks that contain other blocks, or reusable components.

**How it works:** Nested structures are authored separately as fragments and referenced in the parent block.

**Example:**

```
| Tabs |
|------|
| Overview | /fragments/overview |
| Features | /fragments/features |
| Pricing | /fragments/pricing |
```

### 2. Auto-Blocking

**When to use:** Patterns that can be inferred from semantic markup instead of explicit block tables.

**How it works:** Content is authored using natural document structure (headers, lists, etc.) and block code automatically wraps it based on patterns or section metadata.

**Example with section metadata:**

```
---
style: feature-card
---

## Fast Performance
Lightning-fast load times for better user experience.

## Easy to Use
Intuitive interface that anyone can master.
```

### 3. Placeholders for Site-Wide Strings

**The Problem:**

Blocks often need strings like button labels, error messages, search placeholders, or other UI text. Hardcoding these in JavaScript prevents:
- Internationalization (supporting multiple languages)
- Author control over messaging
- Consistency across the site

**The Solution: Placeholders**

AEM EDS provides a placeholders pattern for centrally managing site-wide strings.

**How it works:**

1. **Authors create a `placeholders` sheet** with two columns:
   - Key: Identifier for the string (e.g., `faq-search-placeholder`)
   - Text: The actual string (e.g., `Search frequently asked questions...`)

2. **System converts to JSON** at `/placeholders.json` (or `/en/placeholders.json` for language-specific)

3. **Blocks fetch placeholders** using `fetchPlaceholders()` from `scripts/placeholders.js`

**Example - FAQ Block:**

Instead of hardcoding:

```javascript
// ❌ BAD - Hardcoded strings
searchInput.placeholder = 'Search FAQs...';
noResults.textContent = 'No results found';
```

Use placeholders:

```javascript
// ✅ GOOD - Author-controllable strings
import { fetchPlaceholders } from '../../scripts/placeholders.js';

const placeholders = await fetchPlaceholders();
searchInput.placeholder = placeholders.faqSearchPlaceholder || 'Search FAQs...';
noResults.textContent = placeholders.faqNoResults || 'No results found';
```

---

## Design Principles for Author-Friendly Structures

### 1. Author-First, Not Developer-First

**Bad (developer-friendly):**

```
| Team Members |
|--------------|
| 001 | employee | {"role":"ceo"} |
```

**Good (author-friendly):**

```
| Team Members |
|--------------|
| john.jpg | John Doe | CEO |
```

### 2. Semantic Markup

Use Word/Google Docs features naturally:
- Headers for hierarchy
- Lists for collections
- Tables for structured data
- Bold/italic for emphasis
- **Formatting within cells** to differentiate content types

### 3. Simple Over Complex

**Prefer:**
- **Max ~3 cells per row** - If you need more, it's probably too complex
- Lists over complex nested tables
- One table over multiple related tables
- Standard patterns over custom syntax

### 4. Be Flexible with Input

**Structure should handle:**
- Missing optional fields (gracefully degrade)
- Extra fields authors add (ignore or incorporate)
- Variations in content length
- Different data types in similar positions

---

## Common Block Examples

### Example 1: Simple Card Grid

**Content structure:**

```
| Cards |
|-------|
| image1.jpg | Title 1 | Description 1 |
| image2.jpg | Title 2 | Description 2 |
```

### Example 2: Tabbed Content

**Content structure:**

```
| Tabs |
|------|
| Tab 1 | Content for tab 1 |
| Tab 2 | Content for tab 2 |
```

### Example 3: Hero with CTA

**Content structure:**

```
| Hero |
|------|
| hero-image.jpg |
| Main Headline |
| Supporting description text |
| [Learn More](https://example.com) |
```

### Example 4: Feature List

**Content structure:**

```
| Features |
|----------|
| icon1.svg | Feature Title | Feature description text |
| icon2.svg | Another Feature | More description |
```

---

## Documentation Requirements

When designing a new block's content structure, document:

1. **Block Name** - The name authors will use
2. **Variants** - Any supported variants (e.g., `Cards (large)`)
3. **Column Definitions** - What each column represents
4. **Required vs Optional** - Which fields are mandatory
5. **Content Types** - What type of content each cell expects (image, text, link)
6. **Examples** - At least one complete example
7. **Edge Cases** - How the block handles missing/extra content

### Documentation Template

```markdown
## Block Name

### Purpose
[What this block is for]

### Content Structure
| Block Name (variant) |
|----------------------|
| [Column 1] | [Column 2] | [Column 3] |

### Columns
1. **Column 1** (required): [Description, expected content type]
2. **Column 2** (required): [Description, expected content type]
3. **Column 3** (optional): [Description, expected content type]

### Variants
- **default**: [Behavior]
- **variant-name**: [Behavior]

### Example
[Complete authored example]

### Notes
- [Any special considerations]
```