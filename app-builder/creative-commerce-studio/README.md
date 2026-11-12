# Creative Commerce Studio

Turns product masters in **Box** into shoppable, placement-ready storefront content inside **Experience Workspace**, using **Firefly Creative Production** for the imagery and **Adobe Commerce** for the product link.

```
Workspace library plugin  (tools/creative-commerce-studio/)
  ├─ SKU lookup ─────────────► storefront catalog API (same endpoint/headers as the site)
  ├─ Box / jobs ─────────────► App Builder actions (this folder)
  │                              ├─ IMS-validated author identity
  │                              ├─ Box OAuth + read-only folder access (encrypted tokens)
  │                              ├─ Firefly Creative Production: per-author sign-in, run-workflow MCP
  │                              │   (or REST Workflow API with a server-to-server credential)
  │                              └─ delivery: Product Visuals (AEM Assets) or App Builder public storage
  └─ insert at cursor ───────► Creative Product Spotlight block (blocks/creative-product-spotlight/)
```

Author flow: **Product → Source → Prepare → Review → Insert**. The plugin only inserts the block. Publishing is still the normal Workspace action.

## Status

| Part | State |
|------|-------|
| Spotlight block | Built and browser-tested: desktop/mobile, missing SKU, reduced motion, long copy |
| Workspace plugin | Built and tested in a simulated Workspace frame with a mocked backend |
| App Builder actions | Built, unit-tested (`npm test`, 33 tests). Stage deploy with Box verified in Workspace |
| Box | Connect + folder listing verified in Workspace (2026-11-11) |
| FFCPE (MCP route) | Workflow contract verified with a real run through the MCP (2026-11-12); backend sign-in not yet run live |
| Product Visuals | Needs an AEM server-to-server credential; until then delivery uses App Builder public storage |

## Prerequisites

- Adobe Developer Console project with an App Builder workspace, plus the `aio` CLI on the machine that deploys.
- Firefly Creative Production entitlement and a published workflow (see [workflows/README.md](workflows/README.md)).
- AEM Assets as a Cloud Service environment behind Commerce **Product Visuals**, with **Dynamic Media with OpenAPI** delivery.
- A Box account (a free developer account works) and permission to create an OAuth app.
- An authorized packshot you are allowed to use (and distribute, if it goes in a public repo).

## 1. Box app

1. In the Box Developer Console, create a **Custom App → User Authentication (OAuth 2.0)**.
2. Scopes: **Read all files and folders**. Writing is not needed; the backend never writes to Box.
3. Redirect URI: `https://<namespace>.adobeioruntime.net/api/v1/web/creative-commerce-studio/box-auth-callback`. It must match `BOX_REDIRECT_URI` exactly.
4. Copy the client ID and secret into your App Builder `.env`, never into chat or git.
5. Create a campaign folder, add authorized packshots, and put its numeric ID (from the folder URL) in `BOX_ALLOWED_FOLDER_ID`. Authors can browse only this folder and its subfolders.
6. If your Box enterprise restricts third-party apps, a Box admin must authorize the app.

## 2. Firefly Creative Production

Build and publish the workflow first ([workflows/README.md](workflows/README.md)). Then pick a mode:

**`FFCPE_MODE=mcp` (default, no Adobe credential needed).** The backend is an MCP client of `https://run-workflow.adobe.io/mcp`. Each author clicks **Connect Firefly** on the Prepare step and signs in with their own Adobe account, which must be able to run the workflow. The first sign-in after a deploy registers this backend with Adobe's MCP sign-in server (OAuth dynamic client registration); that creates a client record on Adobe's side. Settings:

- `FIREFLY_REDIRECT_URI`: the backend URL followed by `/firefly-auth-callback`
- `FFCPE_WORKFLOW_ID` and the node IDs `FFCPE_PRODUCT_NODE_ID`, `FFCPE_DESKTOP_NODE_ID`, `FFCPE_MOBILE_NODE_ID` (see the workflow's Execute Graph snippet). Outputs are matched by node ID, never by file name or order.

The run-workflow MCP is a development-time agent service, so this route suits demos and pilots. For production, use `api` mode.

**`FFCPE_MODE=api`.** REST Workflow API (`POST /batch/execute`, status, executions; contract in `https://run-workflow.adobe.io/openapi.json`) with an OAuth Server-to-Server credential. This needs Developer access in the org that owns the workflow. Set `FFCPE_CLIENT_ID`, `FFCPE_CLIENT_SECRET`, `FFCPE_IMS_ORG_ID` and, if your credential requires it, `FFCPE_IMS_USER_ID`. The default request body mirrors the Execute Graph snippet; override it with `FFCPE_EXECUTE_TEMPLATE` if needed.

In both modes the workflow gets a 1-hour presigned App Builder Files URL to the exact Box file version (Box links aren't accepted as workflow input hosts).

## 3. Delivery of approved images

`DELIVERY_MODE=public` (the default when no AEM credential is set) stores approved renditions under App Builder Files `public/creative-commerce-studio/<sku>/` and inserts their public URLs. They are durable and need no extra credential, but they aren't managed assets.

`DELIVERY_MODE=aem` delivers to Product Visuals:

1. In Developer Console, add an OAuth Server-to-Server credential with AEM API access for your AEM Cloud Service environment. Make sure the environment allows that client. Put the credential and scopes in `AEM_CLIENT_ID`, `AEM_CLIENT_SECRET` and `AEM_SCOPES`.
2. Set `AEM_AUTHOR_URL` / `AEM_DELIVERY_URL` (`author-p…-e…` / `delivery-p…-e…`).
3. Renditions go to `AEM_TARGET_FOLDER/<sku>/` and are marked `dam:status=approved` so Dynamic Media can deliver them. No Commerce SKU metadata is written, so they never become catalog product images.

## 4. Deploy the actions

```bash
cd app-builder/creative-commerce-studio
npm install -g @adobe/aio-cli
aio login
aio app use --global        # or: aio app use <downloaded workspace JSON>; choose "merge" for .env
# then append the variables from .env.example to the .env that aio created (keep the AIO_ lines)
npm install
npm test
aio app deploy
```

The deploy prints the action URLs. Your backend base URL is everything before the action name, for example `https://<namespace>.adobeioruntime.net/api/v1/web/creative-commerce-studio`.

## 5. Point the site at the backend

In the site's `config.json` (`public.default`):

```json
"creative-commerce-studio": { "backend-url": "https://<namespace>.adobeioruntime.net/api/v1/web/creative-commerce-studio" }
```

The plugin reads the URL only from the site config, never from its own URL, so the author's token can only go to the configured host. Add every origin that loads the plugin to `ALLOWED_ORIGINS`. Experience Workspace loads library plugins through its preview proxy, so inside Workspace the plugin runs on `https://<branch>--<site>--<org>.preview.da.live` (for example `https://main--electrek-home--kmanns.preview.da.live`), not on the `.aem.page` host. List that origin, `https://da.live`, and the site preview/live hosts. If you register the plugin with a `ref` (branch), add that branch's `preview.da.live` origin too.

## 6. Register the plugin in Experience Workspace

Site config `https://da.live/config#/<org>/<site>/` → **library** sheet, add a row:

| title | description | image | path | ref |
|-------|-------------|-------|------|-----|
| Creative Commerce Studio | Box packshot → FFCPE → shoppable spotlight | *(optional icon URL)* | `https://main--<site>--<org>.aem.page/tools/creative-commerce-studio/creative-commerce-studio.html` | |

For local development, use `ref=local`. Workspace then loads the plugin from `http://localhost:3000`.

## 7. Block

`blocks/creative-product-spotlight/` deploys with the site code. See its [README](../../blocks/creative-product-spotlight/README.md) for the content model. Demo SKUs that exist in the catalog today: `STIHL-BGA200`, `STIHL-HSA60`.

## Security model

- **Author identity:** every call carries the author's Workspace IMS token. The backend validates it with IMS (`IMS_ALLOWED_CLIENT_IDS`, optional `IMS_ALLOWED_ORGS`) and keys all data by that user. There is no shared "current user".
- **Box and Firefly tokens:** stored AES-256-GCM-encrypted in App Builder State, bound to the user, and never sent to the browser. Refreshes are serialized per user, and a revoked refresh token asks the author to reconnect. Firefly sign-in uses PKCE; the verifier never leaves the backend.
- **OAuth state:** one-time, 10-minute, bound to the author who started the flow.
- **Action inputs:** marked `final`, so request parameters cannot override configuration. CORS is limited to `ALLOWED_ORIGINS`.
- **Processing files:** source and output files live in App Builder Files. Only short-lived presigned URLs leave the backend: 1 h for FFCPE input, 15 min for previews.
- **Published page:** contains only the SKU, copy and delivery URLs (random file tokens). No Box links, Firefly output links, job IDs or account IDs.

## Job behaviour

- States: `queued → processing → ready-for-review → accepted`, plus `render-failed`, `delivery-failed`, `cancelled` and `submit-uncertain`.
- One request ID maps to one job, and an active job for the same SKU and file version is reused, so double clicks don't start duplicate paid runs.
- A network failure after sending becomes `submit-uncertain` and is never retried automatically.
- Jobs are kept for 30 days and are listed under **Your recent jobs**, so closing the plugin doesn't strand a completed job.

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| "backend is not configured" | Set `creative-commerce-studio.backend-url` in the site config |
| 403 `origin-not-allowed`, or "The backend could not be reached" in Workspace while the backend is up | The plugin's origin isn't in `ALLOWED_ORIGINS`. In Workspace that is the `…preview.da.live` proxy origin. Add it and run `aio app deploy` |
| "token was not issued to Experience Workspace" | Add the Workspace client ID to `IMS_ALLOWED_CLIENT_IDS` |
| Box popup closes but stays disconnected | Redirect URI mismatch or the enterprise hasn't authorized the app. Check the `box-auth-callback` logs (`aio app logs`) |
| `box-folder-not-allowed` | The file is outside `BOX_ALLOWED_FOLDER_ID` |
| "Adobe's Firefly sign-in did not accept this app's registration" | The MCP sign-in server refused dynamic registration for this redirect URI. Use `api` mode, or check `FIREFLY_REDIRECT_URI` |
| Connect Firefly window closes but stays disconnected | Check `aio app logs` for `firefly-auth-callback`; the Adobe account may lack access to the workflow |
| `ffcpe-error … rejected the request` | Wrong workflow ID or node ID, the workflow isn't published, or (api mode) the request body doesn't match |
| "desktop/mobile composites were not found (output nodes: …)" | The listed node IDs are what came back; set `FFCPE_DESKTOP_NODE_ID` / `FFCPE_MOBILE_NODE_ID` to the composite nodes |
| `delivery-pending` | Asset approved but Dynamic Media isn't serving it yet. Retry Accept after a minute |
| CTA missing on the page | The SKU isn't in this store view (`data-product-status="not-found"` on the block) |

## Disconnect and clean up

- Authors use **Disconnect** in the plugin: for Box it revokes and deletes the token; for Firefly it deletes the stored sign-in.
- Job records expire after 30 days.
- Remove delivered renditions in AEM Assets under `AEM_TARGET_FOLDER`.

## Known limitations

- Single Box connector, single store view, exact-SKU lookup, PNG/JPEG only, one workflow recipe.
- MCP mode depends on the run-workflow MCP's sign-in and tool contract (`run_workflow_submit`, `run_workflow_get_status`), which may change; api mode is the stable route.
- Insertion only; the plugin cannot read or replace existing blocks.
- Price is not shown in the spotlight. The block links to the PDP, where pricing uses the storefront's customer context.
