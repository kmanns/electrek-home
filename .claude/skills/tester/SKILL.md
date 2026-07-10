---
name: tester
description: Performs browser-based testing for storefront customizations. Use when verifying visual changes, testing interactive behavior, validating responsive design, or checking Core Web Vitals.
---

# Tester Skill

## Purpose

Perform browser-based testing and verification of storefront implementations, including visual verification, interactive testing, and performance validation.

---

## Browser-Based Testing (CRITICAL)

If you have access to browser tools, **MANDATORY** use them to verify:
- Visual changes (CSS, layout modifications)
- Drop-in container rendering
- Slot customization display
- Interactive behavior (clicks, form submissions)
- Responsive design across viewport sizes

---

## Navigation

- **PREFER** Navigating manually by clicking on links on the page instead of direct navigation
- **NEVER assume a URL pattern**. Either verify by checking `href` attributes on the page or asking the user for the target location.

---

## Testing Workflow

### 1. Visual Verification

- Navigate to the page(s) containing the modification
- Take snapshot to verify DOM structure
- Verify blocks and dropin containers rendered correctly
- Check custom slot content appears in expected location

### 2. Interactive Testing

- Click elements to verify event handlers
- Submit forms to test validation
- Verify event bus interactions between dropins
- Test navigation and routing

### 3. Performance Verification

- Check network requests (avoid unnecessary API calls)
- Verify lazy loading behavior
- Confirm Core Web Vitals targets met
- Lighthouse score validation (target: 100 for catalog/PDP)

### 4. Responsive Testing

- Test multiple viewport sizes (mobile, tablet, desktop)
- Verify layout adapts correctly
- Check touch interactions on mobile
- Validate CSS breakpoints

---

## Testing Best Practices

- **CRITICAL:** Always test in actual browser, not just code review
- Test both content and commerce blocks
- Verify dropin initialization and data loading
- Check browser console for errors
- Validate accessibility snapshot structure

---

## Common Testing Scenarios

### Block Rendering

- Block decorator executes successfully
- DOM elements created correctly
- CSS classes applied properly
- Configuration loaded via readBlockConfig()

### Dropin Integration

- Container renders into target element
- Slots display custom content
- Event listeners attached correctly
- Props passed correctly to container

### Multi-Block Pages

- Multiple containers render in parallel
- Event bus communication works between dropins
- No race conditions in initialization
- Proper error boundaries

---

## Debugging Patterns

1. **Console messages:** Check for dropin initialization logs
2. **Network requests:** Verify API calls to Commerce services
3. **DOM inspection:** Validate slot injection points
4. **Event monitoring:** Track event bus emissions

---

## Local Testing Setup

### Starting the Development Server

```bash
aem up --html-folder="./drafts/agents"
```

### Creating Test Pages

1. Create test HTML in `drafts/agent/` directory
2. Include required scripts from `head.html`
3. Use decorated HTML structure (nested divs, not tables)
4. Test at `http://localhost:3000/drafts/agent/[test-page]`

### Test Page Template

```html
<!DOCTYPE html>
<html>
<head>
  <!-- Copy exact content from head.html -->
  <script src="/scripts/aem.js" type="module" nonce="aem"></script>
  <script src="/scripts/scripts.js" type="module" nonce="aem"></script>
  <link rel="stylesheet" href="/styles/styles.css">
</head>
<body>
  <main>
    <div class="section">
      <!-- Block with decorated HTML structure -->
      <div class="block-name">
        <div>
          <div>Cell 1</div>
          <div>Cell 2</div>
        </div>
        <div>
          <div>Cell 3</div>
          <div>Cell 4</div>
        </div>
      </div>
    </div>
  </main>
</body>
</html>
```

---

## Console Debugging

### Block Debugging

```javascript
export default async function decorate(block) {
  console.log('Block element:', block);
  console.log('Block HTML:', block.outerHTML);
  console.log('Rows:', [...block.children]);
  console.log('Classes:', block.classList);
  
  // Your decoration code
}
```

### Event Debugging

```javascript
import { events } from '@dropins/tools/event-bus.js';

// Log all events (development only)
events.on('*', (eventName, payload) => {
  console.log('Event:', eventName, payload);
});
```

### Network Debugging

```javascript
// Monitor fetch requests
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  console.log('Fetch:', args[0]);
  const response = await originalFetch(...args);
  console.log('Response:', response.status);
  return response;
};
```

---

## Responsive Testing Breakpoints

| Breakpoint | Width | Device Type |
|------------|-------|-------------|
| Mobile | < 600px | Phone |
| Tablet | 600px - 899px | Tablet |
| Desktop | 900px - 1199px | Laptop |
| Large | 1200px+ | Desktop |

### Testing Commands

```javascript
// Check current viewport
console.log('Width:', window.innerWidth);
console.log('Height:', window.innerHeight);

// Check media query matches
console.log('Mobile:', window.matchMedia('(max-width: 599px)').matches);
console.log('Tablet:', window.matchMedia('(min-width: 600px) and (max-width: 899px)').matches);
console.log('Desktop:', window.matchMedia('(min-width: 900px)').matches);
```

---

## Accessibility Testing

### Keyboard Navigation

1. Tab through all interactive elements
2. Verify focus indicators are visible
3. Test Enter/Space activation on buttons
4. Verify Escape closes modals/dialogs

### Screen Reader Testing

1. Check ARIA labels are descriptive
2. Verify heading hierarchy (h1 → h2 → h3)
3. Test form labels and error messages
4. Verify live regions announce updates

### Accessibility Checklist

- [ ] All images have alt text
- [ ] Color contrast meets WCAG AA (4.5:1 for text)
- [ ] Focus indicators are visible
- [ ] Interactive elements are keyboard accessible
- [ ] Form fields have associated labels
- [ ] Error messages are announced to screen readers

---

## Performance Testing

### Core Web Vitals Targets

| Metric | Target | Description |
|--------|--------|-------------|
| LCP | < 2.5s | Largest Contentful Paint |
| FID | < 100ms | First Input Delay |
| CLS | < 0.1 | Cumulative Layout Shift |

### Lighthouse Testing

```bash
# Run Lighthouse audit
npx lighthouse http://localhost:3000/page --view

# Target scores for catalog/PDP
# Performance: 100
# Accessibility: 100
# Best Practices: 100
# SEO: 100
```

### Network Performance

- Check for unnecessary API calls
- Verify images are lazy loaded
- Confirm CSS/JS is minified
- Check for render-blocking resources

---

## Error Handling Testing

### Common Errors to Test

1. **Network failures** - Disconnect network, verify graceful degradation
2. **API errors** - Mock 500 responses, verify error states
3. **Invalid data** - Pass malformed data, verify validation
4. **Missing elements** - Remove expected DOM elements, verify no crashes

### Error State Verification

```javascript
// Test error handling
try {
  await riskyOperation();
} catch (error) {
  // Verify error is:
  // 1. Logged appropriately
  // 2. User-friendly message displayed
  // 3. No sensitive data exposed
  // 4. Recovery path available
}
```

---

## Test Documentation

### Test Report Template

```markdown
## Test Report: [Feature Name]

### Date: [YYYY-MM-DD]

### Test Environment
- Browser: [Chrome/Firefox/Safari]
- Viewport: [Width x Height]
- Server: [localhost:3000 / preview URL]

### Tests Performed

#### Visual Verification
- [ ] Block renders correctly
- [ ] Styles applied properly
- [ ] Responsive layout works

#### Interactive Testing
- [ ] Click handlers work
- [ ] Form submission works
- [ ] Navigation works

#### Performance
- [ ] No console errors
- [ ] Network requests minimal
- [ ] Load time acceptable

### Issues Found
1. [Issue description]
   - Severity: [High/Medium/Low]
   - Steps to reproduce: [...]
   - Expected: [...]
   - Actual: [...]

### Screenshots
[Attach relevant screenshots]

### Conclusion
[Pass/Fail with summary]
```

---

## Quick Reference

### Start Testing

```bash
aem up --html-folder="./drafts/agents"
```

### Test URL

```
http://localhost:3000/drafts/agent/[test-page]
```

### Console Commands

```javascript
// Log block
console.log(document.querySelector('.block-name'));

// Check events
events.on('*', console.log);

// Check viewport
console.log(window.innerWidth, window.innerHeight);
```

---

**Always use browser tools when available to verify visual and functional changes. Code review alone is insufficient for storefront development.**

---