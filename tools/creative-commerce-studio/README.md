# Creative Commerce Studio — Workspace library plugin

Author UI for Creative Commerce Studio. Full installation and configuration: [app-builder/creative-commerce-studio/README.md](../../app-builder/creative-commerce-studio/README.md).

| File | Purpose |
|------|---------|
| `creative-commerce-studio.html` | Library plugin page (register its URL in the Workspace **library** sheet) |
| `creative-commerce-studio.js` | Stepper UI and state. Uses the Workspace SDK (`https://da.live/nx/utils/sdk.js`) for the author token and `actions.sendHTML` |
| `lib/catalog.js` | Exact-SKU lookup against the site's public catalog endpoint and headers (`/config.json`) |
| `lib/backend.js` | Calls the App Builder actions. The backend URL comes only from `config.json → creative-commerce-studio.backend-url` |
| `lib/block-table.js` | Builds the escaped `creative-product-spotlight` block table for insertion |

Opened outside Workspace, the plugin runs in a standalone preview: product lookup works, while Box and insertion are disabled.
