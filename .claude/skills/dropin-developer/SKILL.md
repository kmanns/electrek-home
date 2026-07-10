---
name: dropin-developer
description: Customizes Commerce drop-in components including slots, containers, and events. Use when integrating drop-ins, implementing slot customizations, or working with drop-in APIs.
---

# Drop-in Developer Skill

## Purpose

Implement and customize commerce drop-in components for the Adobe Commerce storefront, including containers, slots, events, and data fetching.

---

## Drop-ins Overview

Drop-ins are domain-specific, pre-built, composable commerce UI components that are installed as NPM packages and embedded into the site. They implement commerce behavior and the storefront boilerplate wires them into Edge Delivery pages.

The storefront's job is to:
- Render layout (blocks, sections, header/footer)
- Provide Commerce config to drop-ins
- Apply styling & localization
- Let business users author content around the drop-ins (e.g. marketing copy above PDP, banners in cart page)

**ALWAYS:** Use the **Researcher skill** to search documentation and verify types when working with a specific drop-in.

**IMPORTANT:** Focus your custom work on:
- New blocks that compose drop-ins with extra content/UI
- Custom slots inside drop-ins (upsells, banners, extra validation)

Drop-ins provide API functions specific to their domain — see the **API** section below for details.

---

## Containers

- **Containers** are component functions exported from dropins that render into DOM elements.
- Containers manage and display data for specific use cases, and often provide interactive elements.
- Containers are rendered into DOM elements using `render` provider functions.
- A block can contain multiple dropin containers, each rendered into a different DOM element

### Container Usage Pattern

```javascript
import ContainerName from '@dropins/dropin-name/containers/ContainerName.js';
import { render as provider } from '@dropins/dropin-name/render.js';

// Render container into DOM element
provider(ContainerName, {
  // Container props
  prop1: value1,
  prop2: value2,
  slots: {
    SlotName: (ctx) => {
      // Custom slot content
    },
  },
})(domElement);
```

### Container Props

- Each container has specific options defined in its type definitions.
- Arguments are passed to the render function with the container being passed as the first argument and the container options being passed in an object as the second argument.
- Common options include callback functions, slot callbacks, and other configuration options.
- **ALWAYS** use the **Researcher skill** to verify the correct arguments and their types

### Container Rendering

- Containers are rendered using dropin provider functions
- Multiple containers can be rendered in the same block
- Each container needs its own DOM element

---

## Slots

- Slots are interfaces to customize content within containers
- They allow injection of custom content into specific areas.
- Prefer slots over manual DOM manipulation since the context has functions that allow you to append, replace, prepend, etc.
- **NEVER hallucinate slots** - always use the **Researcher skill** to verify slot names exist before using them.
- If an appropriate slot does not exist, then using the block layout (ie `createContextualFragment`) is the next best option.
- The Slot callback gets a `ctx` object with explicit properties in the type definitions. **ALWAYS** use the **Researcher skill** to verify the correct slot context definition.
- **IMPORTANT:** Slots do not return elements. You must use the DOM manipulation functions in the `ctx` object to render a DOM element on the page.

### Slot Usage Pattern

```javascript
provider(ContainerName, {
  // Container props
  slots: {
    SlotName: (ctx) => {
      // Create custom content
      const customElement = document.createElement('div');
      // Render or set the inner content for this element
      customElement.textContent = 'Custom content';
      // Replace existing slot content with new custom content
      ctx.replaceWith(customElement);
    },
  },
})(domElement);
```

### Slot Context Methods

Common methods available on the `ctx` object:

```javascript
slots: {
  SlotName: (ctx) => {
    const element = document.createElement('div');
    
    // Common context methods:
    ctx.replaceWith(element);  // Replace slot content
    ctx.append(element);       // Append to slot
    ctx.prepend(element);      // Prepend to slot
    
    // Access data from context
    const { data } = ctx;      // Slot-specific data
  },
}
```

---

## Events

- Drop-ins use an **event-bus** to communicate with each other and with the storefront code.
- Each event has a specific payload associated with it when emitted. **ALWAYS** check documentation for the correct payload definition.

### Event Subscription Pattern

```javascript
import { events } from '@dropins/tools/event-bus.js';

// Subscribe to an event
events.on('event/name', (payload) => {
  // Handle event payload
  console.log('Event received:', payload);
});

// Unsubscribe from an event
const unsubscribe = events.on('event/name', handler);
unsubscribe(); // Call to remove listener
```

### Common Event Patterns

```javascript
// Cart events
events.on('cart/data', (cartData) => {
  // Cart data updated
});

events.on('cart/updated', (payload) => {
  // Cart was modified
});

// Product events
events.on('product/data', (productData) => {
  // Product data loaded
});
```

---

## API

- Drop-ins provide API functions for the domains they are responsible for. For example, the Cart drop-in provides API for working with the cart.
- API functions are used to fetch data, perform mutations, or interact with backend services.
- **MANDATORY:** Use the **Researcher skill** to verify an API function exists and what its exact parameters and return values are before using it.
- **NEVER** assume an API function exists or what its parameters/return values look like.

### API Import Pattern

```javascript
import { apiFunction } from '@dropins/dropin-name/api.js';
```

### API Usage Example

```javascript
import { addProductsToCart } from '@dropins/storefront-cart/api.js';

// Call the API function with verified parameters
const result = await addProductsToCart([{ sku: 'PRODUCT-SKU', quantity: 1 }]);
```

### Enabling API Functions

Some API functions require you to initialize the drop-in before you can use them.

This is done by importing the appropriate initializer script. This ensures that the drop-in's `setEndpoint()` function is called with the correct endpoint.

**MANDATORY:** Before importing an initializer script, use the **Researcher skill** to read and analyze its source code for side effects that may cause errors without the right conditions (e.g., DOM access, assumptions about page context, or eager network requests).

**IMPORTANT:** If the initializer script contains problematic side effects, manually call `setEndpoint()` with the correct endpoint instead of importing the initializer script.

---

## Working with Drop-ins (CRITICAL)

- **MANDATORY:** Use the **Researcher skill** to search documentation and verify all slots, props, events, and APIs before implementing any drop-in customization
- **MANDATORY: Never assume slot names** - use the Researcher skill to verify first
- **MANDATORY: Use container props and interface if possible before using CSS** by using the documented interface, like Slots or container arguments, before using CSS

---

## Fetching Commerce Data

### Data from dropin events

Dropins communicate with each other and with the storefront code using the event bus, and they often provide data related to their domains in the event payloads they emit.

**Subscribe** to these events to get access to this data.

Use the **Researcher skill** to determine what events are emitted, their payloads, and where they are documented (block READMEs, commerce docs, existing code).

**NEVER** Assume an event exists or what its payload looks like.

**ALWAYS** Verify using the Researcher skill before subscribing to events.

**Example:**
```javascript
import { events } from '@dropins/tools/event-bus.js';

// Listen for the cart/data event
events.on('cart/data', (payload) => {
  // Add your custom logic for the payload
});
```

### Data from dropin API functions

Drop-in API functions can also be used to fetch domain-specific data. See the **API** section for full details on API functions, including import patterns, usage examples, and initialization requirements.

---

## Complete Block Example with Drop-in

```javascript
import { events } from '@dropins/tools/event-bus.js';
import ContainerName from '@dropins/dropin-name/containers/ContainerName.js';
import { render as provider } from '@dropins/dropin-name/render.js';

export default async function decorate(block) {
  // Create container element
  const container = document.createElement('div');
  container.classList.add('dropin-container');
  
  // Clear block and add container
  block.textContent = '';
  block.append(container);
  
  // Render the drop-in container
  provider(ContainerName, {
    // Props
    onSuccess: (data) => {
      console.log('Success:', data);
    },
    onError: (error) => {
      console.error('Error:', error);
    },
    // Slots
    slots: {
      CustomSlot: (ctx) => {
        const customContent = document.createElement('div');
        customContent.classList.add('custom-content');
        customContent.textContent = 'Custom slot content';
        ctx.append(customContent);
      },
    },
  })(container);
  
  // Subscribe to events
  events.on('dropin/event', (payload) => {
    // Handle event
  });
}
```

---

## Multiple Containers in One Block

```javascript
export default async function decorate(block) {
  // Create containers
  const primaryContainer = document.createElement('div');
  primaryContainer.classList.add('primary-container');
  
  const secondaryContainer = document.createElement('div');
  secondaryContainer.classList.add('secondary-container');
  
  // Setup block structure
  block.textContent = '';
  block.append(primaryContainer);
  block.append(secondaryContainer);
  
  // Render containers in parallel
  await Promise.all([
    provider(PrimaryContainer, { /* props */ })(primaryContainer),
    provider(SecondaryContainer, { /* props */ })(secondaryContainer),
  ]);
}
```

---

## Styling Drop-ins

### CSS Custom Properties (Design Tokens)

Drop-ins expose CSS custom properties for styling:

```css
/* Override drop-in design tokens */
.block-name {
  --color-primary: #0066cc;
  --color-secondary: #333333;
  --font-size-base: 16px;
  --spacing-unit: 8px;
}
```

### Scoped Overrides

```css
/* Target specific drop-in elements within your block */
.block-name .dropin-container {
  padding: var(--spacing-unit);
}

.block-name .dropin-button {
  background-color: var(--color-primary);
}
```

---

## Common Mistakes to Avoid

### ❌ Hallucinating Slots

**Wrong:**
```javascript
slots: {
  NonExistentSlot: (ctx) => {  // This slot doesn't exist!
    ctx.append(element);
  },
}
```

**Correct:**
```javascript
// First, check documentation for available slots
// Then use only documented slots
slots: {
  DocumentedSlotName: (ctx) => {
    ctx.append(element);
  },
}
```

### ❌ Assuming Event Payloads

**Wrong:**
```javascript
events.on('cart/data', (payload) => {
  const total = payload.grandTotal;  // Assuming field exists
});
```

**Correct:**
```javascript
// First, check documentation for payload structure
events.on('cart/data', (payload) => {
  const total = payload?.prices?.grandTotal?.value;  // Safe access
});
```

### ❌ Hallucinating API Functions

**Wrong:**
```javascript
import { getNonExistentFunction } from '@dropins/storefront-cart/api.js';

// Calling a function that doesn't exist or with wrong parameters
const result = await getNonExistentFunction({ sku: 'PRODUCT-SKU' });
```

**Correct:**
```javascript
// First, use the Researcher skill to verify the API function exists
// and confirm its exact parameters and return type
import { addProductsToCart } from '@dropins/storefront-cart/api.js';

const result = await addProductsToCart([{ sku: 'PRODUCT-SKU', quantity: 1 }]);
```

### ❌ Returning Elements from Slots

**Wrong:**
```javascript
slots: {
  SlotName: (ctx) => {
    const element = document.createElement('div');
    return element;  // ❌ Slots don't return elements!
  },
}
```

**Correct:**
```javascript
slots: {
  SlotName: (ctx) => {
    const element = document.createElement('div');
    ctx.replaceWith(element);  // ✅ Use context methods
  },
}
```

### ❌ Using Dropin Functions Outside Slot Context

**Wrong:**
```javascript
// In block code (not a slot)
tryRenderAemAssetsImage({
  data: { sku },
  defaultImageProps: { src, alt, width, height },
});
```

**Correct:**
```javascript
// In block code, use native DOM
const img = document.createElement('img');
img.src = mainImage.url;
img.alt = name;
img.width = 400;
img.height = 400;
```

---

## TypeScript Definitions

Drop-in TypeScript definitions are available in `node_modules/@dropins/`. For detailed instructions on how to explore and use these definitions (discovering containers, checking props, finding slots, understanding event payloads), see the **Researcher skill**.

---

## Quick Reference

### Import Patterns

```javascript
// Container
import ContainerName from '@dropins/dropin-name/containers/ContainerName.js';

// Render function
import { render as provider } from '@dropins/dropin-name/render.js';

// Event bus
import { events } from '@dropins/tools/event-bus.js';

// API functions (if available)
import { apiFunction } from '@dropins/dropin-name/api.js';
```

### Render Pattern

```javascript
provider(Container, { props, slots })(domElement);
```

### Event Pattern

```javascript
events.on('event/name', (payload) => { /* handle */ });
```