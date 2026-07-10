---
name: researcher
description: Finds and provides relevant information for storefront development tasks. Use when searching official documentation, exploring TypeScript definitions, checking existing codebase patterns, or verifying slots/props/events/APIs before implementation.
---

# Researcher Skill

## Purpose

Find and provide relevant information for storefront development tasks by searching official documentation, exploring the codebase, and analyzing TypeScript definitions. This skill is the **single source of truth** for how to research before implementing.

**SCOPE REMINDER:** This skill researches **storefront development only** (EDS blocks, drop-ins, frontend APIs). For **backend integrations** or **backend webhooks**, redirect to the appropriate starter kit (Integration or Checkout).

---

## When to Use This Skill

**MANDATORY:** Use this skill BEFORE implementing any of the following:
- Drop-in customizations (slots, containers, events, APIs)
- New blocks or block modifications
- Commerce API integrations
- Any feature where you're uncertain about available interfaces, props, events, or patterns

**Other skills delegate to this skill** when they need information. If another skill says "use the researcher skill," follow the relevant research protocol below.

---

## Research Protocol

### Step 1: Define What You Need

Before searching, clearly define:
- **What** information you need (e.g., "available slots for ProductDetails container")
- **Why** you need it (e.g., "to customize the product image area")
- **What type** of information it is:
  - API functions, props, or return types
  - Slot names and context objects
  - Event names and payloads
  - Integration patterns or examples
  - Existing implementations to reuse

### Step 2: Search Using the Right Source

Use the decision tree below to choose where to search:

```
┌─────────────────────────────────────────┐
│ "What information do I need?"           │
└─────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────────┐
│ Official API, slots, events,  │──YES──► commerce-extensibility:search-commerce-docs MCP tool
│ or integration patterns?      │
└───────────────────────────────┘
         │ NO
         ▼
┌───────────────────────────────┐
│ TypeScript types, container   │──YES──► TypeScript Definitions
│ props, or available imports?  │         (node_modules/@dropins/)
└───────────────────────────────┘
         │ NO
         ▼
┌───────────────────────────────┐
│ Existing implementations,     │──YES──► Codebase Search
│ patterns, or block code?      │         (project files)
└───────────────────────────────┘
         │ NO
         ▼
┌───────────────────────────────┐
│ Block-specific behavior,      │──YES──► Block README Files
│ events emitted, or config?    │         (blocks/*/README.md)
└───────────────────────────────┘
```

### Step 3: Verify and Cross-Reference

- **NEVER** trust a single source alone for critical information (slots, events, APIs)
- Cross-reference documentation with TypeScript definitions when possible
- If documentation and code disagree, the **code is the source of truth** for current behavior

---

## Documentation MCP Tools

### Overview

The **commerce-extensibility:search-commerce-docs** MCP tool provides access to official Adobe Commerce and Storefront documentation. This is your **primary source** for API references, integration patterns, and usage examples.

### When to Use

- **MANDATORY** before implementing any drop-in customization
- **MANDATORY** before using any slot, prop, or event
- When you need official API function signatures
- When you need integration patterns or security guidelines
- When you need usage examples for Commerce features

### How to Search

Call the **commerce-extensibility:search-commerce-docs** MCP tool with specific, targeted queries for best results.

**Search Execution Rules:**
- ALWAYS set `maxResults` to at least `10` on every `search-commerce-docs` call
- NEVER stop at a single search query — analyze results and refine
- When results contain documentation URLs, use `WebFetch` to retrieve full page content rather than relying on truncated search snippets
- When results mention specific slot names, event names, API functions, or features not yet explored, run a follow-up search targeting those specifically
- Continue searching until the question is fully answered or no new information is found
- Minimum 2 search iterations for any documentation research task
- **Fail-safe:** Stop after a maximum of 10 search calls per research task. If 2 consecutive searches return no new relevant information, stop early — the answer is either found or not available in the docs

**Good queries (specific):**
- "Cart dropin api functions"
- "ProductDetails container slots"
- "checkout dropin event payloads"
- "storefront cart/data event"
- "PDP dropin slot customization examples"

**Bad queries (too vague):**
- "dropin"
- "commerce"
- "how to customize"

### What to Search For

| Need | Example Query |
|------|---------------|
| Container API | "[Dropin name] containers" |
| Available slots | "[Container name] slots" |
| Event payloads | "[Dropin name] events" |
| API functions | "[Dropin name] api functions" |
| Extension points | "[Dropin name] extension points" |
| Integration patterns | "[Feature] integration pattern" |
| Security guidelines | "storefront security [topic]" |

### Iterative Search Protocol

After each search:
1. **Analyze results** for leads — slot names, event names, API method names, URLs, partial references
2. **Run follow-up searches** with refined/narrower queries based on discoveries
3. **Use `WebFetch`** on any documentation URLs found in results to get the full page content
4. **Continue** until no new relevant information surfaces or the question is fully answered

**Minimum Search Depth:**

| Task Type | Minimum Searches |
|---|---|
| Drop-in customization research | 2-3 searches (API + slots + events) |
| New block implementation | 2-3 searches per drop-in involved |
| Bug investigation | At least 2 searches with refinement |
| Ad-hoc questions | At least 2 searches with refinement |

### Fallback: When the MCP Tool is Unavailable

If the commerce-extensibility:search-commerce-docs MCP tool is unavailable or not configured, search the official Adobe Commerce Storefront documentation site directly:

**https://experienceleague.adobe.com/developer/commerce/storefront**

Use your web search or web fetch tools to find the relevant topic on this site. Append your search terms to a web search query targeting this domain, for example:
- "site:experienceleague.adobe.com/developer/commerce/storefront cart dropin slots"
- "site:experienceleague.adobe.com/developer/commerce/storefront ProductDetails container API"

The same query guidelines apply — use specific, targeted queries rather than vague terms.

---

## Codebase Search

### Overview

Search the project codebase to find existing implementations, patterns, and reusable code before building from scratch.

### When to Use

- **MANDATORY** before creating any new block (check `/blocks` directory)
- When looking for existing patterns to reuse or adapt
- When checking how a drop-in is currently initialized or configured
- When finding where events are subscribed to or emitted
- When checking existing import patterns

### Where to Search

| What You Need | Where to Look |
|---------------|---------------|
| Existing blocks | `/blocks` directory |
| Block implementations | `/blocks/[block-name]/[block-name].js` |
| Block styles | `/blocks/[block-name]/[block-name].css` |
| Block documentation | `/blocks/[block-name]/README.md` |
| Drop-in initializers | `/scripts/initializers/` |
| Global commerce config | `/scripts/commerce.js` |
| Global scripts | `/scripts/scripts.js` |
| Design tokens & styles | `/styles/` |

### Search Patterns

**Find existing blocks:**
- List all blocks in the `/blocks` directory
- Read block README files for functionality descriptions
- Check block JavaScript for patterns you can reuse

**Find drop-in usage patterns:**
- Search for import statements: `@dropins/[dropin-name]`
- Search for container renders: `provider(ContainerName`
- Search for event subscriptions: `events.on('`

**Find configuration patterns:**
- Check `/scripts/initializers/` for drop-in setup
- Check `/scripts/commerce.js` for Commerce configuration
- Search for `setEndpoint` calls for API endpoint configuration

---

## TypeScript Definitions

### Overview

Drop-in TypeScript definitions in `node_modules/@dropins/` are the **authoritative source** for available containers, props, slots, events, and API functions.

### When to Use

- To discover available containers for a drop-in
- To check exact prop types and names for containers
- To find available slot names and their context types
- To understand event payload structures
- To verify API function signatures and return types

### How to Explore

**Discover available drop-ins:**
```bash
ls node_modules/@dropins/
```

**Explore a specific drop-in's structure:**
```bash
ls node_modules/@dropins/storefront-[dropin-name]/
```

**Find containers:**
```bash
ls node_modules/@dropins/storefront-[dropin-name]/containers/
```

**Read type definitions:**
- Look for `.d.ts` files in the drop-in package
- Check `containers/` directory for container types
- Check `api.d.ts` or `api/` for API function signatures

### What to Look For

| Need | Location |
|------|----------|
| Available containers | `node_modules/@dropins/[pkg]/containers/` |
| Container props | `.d.ts` files in container directory |
| Slot definitions | Type definitions within container types |
| API functions | `node_modules/@dropins/[pkg]/api.js` or `api/` |
| Event types | Type definitions referencing event names |
| Render function | `node_modules/@dropins/[pkg]/render.js` |

---

## Block README Files

### Overview

Many blocks include a `README.md` file that documents the block's behavior, configuration, events emitted, and integration details.

### When to Use

- When working within an existing block's code
- When you need to understand what events a block emits
- When checking what drop-in containers a block uses
- When understanding block-specific configuration

### How to Find

```bash
# Check if a specific block has documentation
ls blocks/[block-name]/README.md

# List all blocks with READMEs
find blocks -name "README.md"
```

### What They Contain

Block READMEs typically document:
- Block purpose and functionality
- Events emitted and their conditions
- Drop-in containers used
- Configuration options
- Side effects and dependencies

---

## Research Verification Checklist

Before using any researched information in code, verify:

- [ ] **Slot names** confirmed via commerce-extensibility:search-commerce-docs AND/OR TypeScript definitions
- [ ] **Event names and payloads** verified through documentation or existing code
- [ ] **API function signatures** checked against type definitions
- [ ] **Container props** validated against documentation or types
- [ ] **Existing implementations** checked before building from scratch

### Critical Rules

- **NEVER** hallucinate slot names — always verify they exist
- **NEVER** assume event payloads — always check the structure
- **NEVER** assume API functions exist — verify in documentation or types
- **NEVER** skip the reusability check for blocks — always check `/blocks` first
- **ALWAYS** use specific queries when searching documentation
- **ALWAYS** cross-reference when possible (docs + types + existing code)

---

## Quick Reference

### Common Research Tasks

| Task | Primary Source | Secondary Source |
|------|---------------|-----------------|
| "What slots does X container have?" | commerce-extensibility:search-commerce-docs | TypeScript definitions |
| "What events does X dropin emit?" | commerce-extensibility:search-commerce-docs | Block README files |
| "Does a block for X already exist?" | Codebase (`/blocks`) | — |
| "What props does X container accept?" | TypeScript definitions | commerce-extensibility:search-commerce-docs |
| "How is X dropin initialized?" | Codebase (`/scripts/initializers/`) | commerce-extensibility:search-commerce-docs |
| "What API functions does X provide?" | commerce-extensibility:search-commerce-docs | TypeScript definitions |
| "What's the payload for X event?" | commerce-extensibility:search-commerce-docs | Existing event handlers in code |

### Research Order for Drop-in Work

1. **commerce-extensibility:search-commerce-docs** → Search for official docs on the drop-in/container/feature
2. **TypeScript Definitions** → Verify types, props, slots in `node_modules/@dropins/`
3. **Codebase** → Check existing implementations and patterns
4. **Block READMEs** → Check block-specific documentation for events and behavior

### Research Order for Block Work

1. **Codebase** → Check `/blocks` directory for existing or similar blocks
2. **Block READMEs** → Read documentation for blocks being modified
3. **commerce-extensibility:search-commerce-docs** → Search for any Commerce-specific integration needs
4. **TypeScript Definitions** → Check drop-in types if block uses drop-ins