# Creative Commerce Studio — Workspace library plugin

> [!WARNING]
> **Demo build — not production-ready.** See [PRODUCTION-READINESS.md](../../app-builder/creative-commerce-studio/PRODUCTION-READINESS.md) for the API access, roles and credentials needed before real use.

Author UI for Creative Commerce Studio. Full installation and configuration: [app-builder/creative-commerce-studio/README.md](../../app-builder/creative-commerce-studio/README.md).

| File | Purpose |
|------|---------|
| `creative-commerce-studio.html` | Library plugin page (register its URL in the Workspace **library** sheet) |
| `creative-commerce-studio.js` | Stepper UI and state. Uses the Workspace SDK (`https://da.live/nx/utils/sdk.js`) for the author token and `actions.sendHTML` |
| `lib/catalog.js` | Exact-SKU lookup against the site's public catalog endpoint and headers (`/config.json`) |
| `lib/backend.js` | Calls the App Builder actions. The backend URL comes only from `config.json → creative-commerce-studio.backend-url` |
| `lib/block-table.js` | Builds the escaped `creative-product-spotlight` block table for insertion |
| `vendor/spectrum.js` | Pre-built [Spectrum Web Components](https://opensource.adobe.com/spectrum-web-components/) bundle, Spectrum 2 theme (`sp-theme system="spectrum-two"`). Committed so the plugin needs no build step or third-party CDN at runtime |
| `build/` | Source for the bundle (`entry.js` lists the components used). Not served by the site (`.hlxignore`) |

Opened outside Workspace, the plugin runs in a standalone preview: product lookup works, while Box and insertion are disabled.

## Design

UI built from Spectrum 2 components:

- `sp-tabs` for the steps
- `sp-textfield` / `sp-field-label` / `sp-help-text` for fields
- `sp-button` and `sp-action-button`
- `sp-checkbox` and `sp-radio-group`
- `sp-status-light` for job and stock state
- `sp-progress-circle` while a job runs
- `sp-accordion` for recent jobs
- Spectrum workflow icons

The product card, Box file tiles and inline alerts are plain HTML styled with Spectrum 2 tokens (`--spectrum-*`). The Adobe Clean font isn't bundled (it's licensed), so the theme falls back to the system sans-serif.

## Updating the Spectrum bundle

```bash
cd tools/creative-commerce-studio/build
npm install
npm run build      # writes ../vendor/spectrum.js (+ LEGAL.txt with licenses)
```

When you use a new Spectrum component or icon in the plugin, add its import to `build/entry.js` and rebuild. Component versions are pinned in `build/package.json`.
