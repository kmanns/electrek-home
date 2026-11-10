# Creative Commerce Studio

Turns product masters in **Box** into shoppable, placement-ready storefront content inside **Experience Workspace**, using **Firefly Creative Production** for the imagery and **Adobe Commerce** for the product link.

```
Workspace library plugin  (tools/creative-commerce-studio/)
  ├─ SKU lookup ─────────────► storefront catalog API (same endpoint/headers as the site)
  ├─ Box / jobs ─────────────► App Builder actions (this folder)
  │                              ├─ IMS-validated author identity
  │                              ├─ Box OAuth + read-only folder access (encrypted tokens)
  │                              ├─ FFCPE Workflow API: submit / status / outputs
  │                              └─ Product Visuals (AEM Assets): upload + approve → delivery URL
  └─ insert at cursor ───────► Creative Product Spotlight block (blocks/creative-product-spotlight/)
```

Author flow: **Product → Source → Prepare → Review → Insert**. The plugin only inserts the block. Publishing is still the normal Workspace action.

## Status

| Part | State |
|------|-------|
| Spotlight block | Built and browser-tested: desktop/mobile, missing SKU, reduced motion, long copy |
| Workspace plugin | Built and tested in a simulated Workspace frame with a mocked backend |
| App Builder actions | Built, unit-tested (`npm test`, 21 tests); **not yet deployed** |
| Box, FFCPE, Product Visuals | **Need your accounts and credentials**. Nothing has been run against them yet |

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

Follow [workflows/README.md](workflows/README.md): build and publish the workflow, add the server-to-server credential, and record the Workflow API base URL and request body from your tenant's API reference.

## 3. Product Visuals delivery

1. In Developer Console, add an OAuth Server-to-Server credential with AEM API access for your AEM Cloud Service environment. Make sure the environment allows that client. Put the credential and scopes in `AEM_CLIENT_ID`, `AEM_CLIENT_SECRET` and `AEM_SCOPES`.
2. Set `AEM_AUTHOR_URL` / `AEM_DELIVERY_URL` (`author-p…-e…` / `delivery-p…-e…`).
3. Renditions go to `AEM_TARGET_FOLDER/<sku>/` and are marked `dam:status=approved` so Dynamic Media can deliver them. No Commerce SKU metadata is written, so they never become catalog product images.

## 4. Deploy the actions

```bash
cd app-builder/creative-commerce-studio
cp .env.example .env        # fill in values (see comments in the file)
npm install
npm test
aio login && aio app use    # select your org / project / workspace
aio app deploy
```

The deploy prints the action URLs. Your backend base URL is everything before the action name, for example `https://<namespace>.adobeioruntime.net/api/v1/web/creative-commerce-studio`.

## 5. Point the site at the backend

In the site's `config.json` (`public.default`):

```json
"creative-commerce-studio": { "backend-url": "https://<namespace>.adobeioruntime.net/api/v1/web/creative-commerce-studio" }
```

The plugin reads the URL only from the site config, never from its own URL, so the author's token can only go to the configured host. Add every origin that loads the plugin (site preview/live hosts and `https://da.live`) to `ALLOWED_ORIGINS`.

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
- **Box tokens:** stored AES-256-GCM-encrypted in App Builder State, bound to the user, and never sent to the browser. Refreshes are serialized per user, and a revoked refresh token asks the author to reconnect.
- **OAuth state:** one-time, 10-minute, bound to the author who started the flow.
- **Action inputs:** marked `final`, so request parameters cannot override configuration. CORS is limited to `ALLOWED_ORIGINS`.
- **Processing files:** source and output files live in App Builder Files. Only short-lived presigned URLs leave the backend: 1 h for FFCPE input, 15 min for previews.
- **Published page:** contains only the SKU, copy and Product Visuals delivery URLs. No Box links, job IDs or account IDs.

## Job behaviour

- States: `queued → processing → ready-for-review → accepted`, plus `render-failed`, `delivery-failed`, `cancelled` and `submit-uncertain`.
- One request ID maps to one job, and an active job for the same SKU and file version is reused, so double clicks don't start duplicate paid runs.
- A network failure after sending becomes `submit-uncertain` and is never retried automatically.
- Jobs are kept for 30 days and are listed under **Your recent jobs**, so closing the plugin doesn't strand a completed job.

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| "backend is not configured" | Set `creative-commerce-studio.backend-url` in the site config |
| 403 `origin-not-allowed` | Add the plugin's origin to `ALLOWED_ORIGINS` and redeploy |
| "token was not issued to Experience Workspace" | Add the Workspace client ID to `IMS_ALLOWED_CLIENT_IDS` |
| Box popup closes but stays disconnected | Redirect URI mismatch or the enterprise hasn't authorized the app. Check the `box-auth-callback` logs (`aio app logs`) |
| `box-folder-not-allowed` | The file is outside `BOX_ALLOWED_FOLDER_ID` |
| `ffcpe-error … rejected the request` | `FFCPE_EXECUTE_TEMPLATE` doesn't match your tenant's API, or the workflow isn't published |
| `ffcpe-outputs-unmapped` | Output names don't contain the `FFCPE_OUTPUT_MATCH` substrings |
| `delivery-pending` | Asset approved but Dynamic Media isn't serving it yet. Retry Accept after a minute |
| CTA missing on the page | The SKU isn't in this store view (`data-product-status="not-found"` on the block) |

## Disconnect and clean up

- Authors use **Disconnect** in the plugin, which revokes the Box token and deletes it.
- Job records expire after 30 days.
- Remove delivered renditions in AEM Assets under `AEM_TARGET_FOLDER`.

## Known limitations

- Single Box connector, single store view, exact-SKU lookup, PNG/JPEG only, one workflow recipe.
- The FFCPE request body and output names are configuration because the public docs don't specify them. Confirm them against your tenant before the first run.
- Insertion only; the plugin cannot read or replace existing blocks.
- Price is not shown in the spotlight. The block links to the PDP, where pricing uses the storefront's customer context.
