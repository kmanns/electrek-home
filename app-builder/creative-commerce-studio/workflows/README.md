# FFCPE workflow: product packshot → desktop + mobile placements

This recipe is built in **Firefly Creative Production** (Firefly web → Creative Production → custom workflows) and published so the backend can call it through the **Workflow API**. No generative imagery: the product photo is cut out and placed, never re-drawn.

## Recipe (v1)

| # | Node | Settings |
|---|------|----------|
| 1 | Input asset | One image per execution (PNG/JPEG packshot). Must accept a URL input — the backend passes a 1-hour presigned URL to the exact Box file version. |
| 2 | Remove background | Skip if your packshots are already transparent. |
| 3 | Photoshop template merge — **desktop** | PSD 1600×900, smart object layer named `product`, approved background layer, product fit "contain" with safe margins. No baked-in text, price or CTA. |
| 4 | Photoshop template merge — **mobile** | PSD 800×1000, same layer names. Compose intentionally; do not center-crop the desktop. |
| 5 | Export | JPEG (quality ~85) or PNG. The backend picks outputs by **node ID** (`FFCPE_DESKTOP_NODE_ID`, `FFCPE_MOBILE_NODE_ID`), so output file names don't matter. |

Prefer two simple templates over a multi-artboard file until you have confirmed how many outputs it produces.

## Publish and record the contract

1. Validate the workflow on one authorized packshot and inspect both outputs: whole product visible, clean edges, no distortion, correct size.
2. Publish the workflow and note its **workflow ID** (`FFCPE_WORKFLOW_ID`).
3. From the published workflow's **Execute Graph (cURL)** snippet, note the `node_id` of the product image input (`FFCPE_PRODUCT_NODE_ID`). Note the node IDs of the desktop and mobile composite nodes as well (`FFCPE_DESKTOP_NODE_ID`, `FFCPE_MOBILE_NODE_ID`). Inputs you don't send keep the workflow's published defaults.
4. Choose how the backend runs it (see the main README):
   - `FFCPE_MODE=mcp`: authors sign in with their own Adobe account via **Connect Firefly**. No credential needed.
   - `FFCPE_MODE=api`: add an **OAuth Server-to-Server** credential for the Firefly Services / Creative Production API (`FFCPE_CLIENT_ID`, `FFCPE_CLIENT_SECRET`, `FFCPE_IMS_ORG_ID`). The documented scopes are `openid,AdobeID,session,additional_info,read_organizations,firefly_api,ff_apis`. The REST contract is published at `https://run-workflow.adobe.io/openapi.json`.
5. Run one small authorized job (it may be billable) and confirm the plugin reaches **ready-for-review**.

Optional `FFCPE_EXECUTE_TEMPLATE` (api mode) placeholders: `{{workflowId}}`, `{{productNodeId}}`, `{{sourceUrl}}`, `{{sku}}`, `{{jobId}}`, `{{productName}}`, `{{sourceName}}`. Values are JSON-escaped. An unknown placeholder fails the job before anything is sent. The template only supports workflows whose only input is the product photo; leave it unset for workflows with scene images.

## Workflows with extra image inputs (for example Campaign Looks)

A workflow can take more inputs than the product photo, such as a scene background and a placement mask per channel. The extension supplies them from private backend storage (`inputs` in `workflows.json`; see "Choosing a workflow" in the README).

- **Publish with all inputs connected,** and note every input's node ID. Don't rely on the workflow keeping defaults for inputs the extension sends.
- **Choices such as a "look" are made in the extension, not the workflow.** Make one `workflows.json` entry per look, each with the same `workflowId` and its own scene images. The workflow has no look parameter.
- **One product and one set of scene images per run.** Several images in one input can produce unintended combinations instead of matched pairs.
- **Masks are opaque grayscale PNGs** at exactly their background's size: white marks the placement region, black protects the rest.
- **The final composites must be their own nodes.** The extension picks them by node ID from a response that also contains the source images, masks and intermediate cutouts.

## Tested versions

- 2026-11-17: "Campaign Looks" (published execution ID `0a06005b-7a67-43a4-b359-fd1eb236d7f1`): five image inputs (product photo `node_1794859332_81009703`; desktop background `…_632333d2` and mask `…_820db7fd`; mobile background `…_c43928ef` and mask `…_b235a924`), then background removal and Precise composites (pixelperfect, blend 0.8, harmonization 0.4, 1 variation, seed 333). Final composites: desktop `node_1794859332_4154bf97` (JPEG 1200×896) and mobile `node_1794859332_70dfe366` (JPEG 896×1200). The **Workshop** look was exercised in Firefly with two products; Premium Studio and Holiday Gifting weren't re-rendered after the last blending change. Transient composite HTTP 500s happened during testing, and per-product retries succeeded. The extension's end-to-end run with this workflow has not happened yet. The look entries are in `workflows.json`.
- 2026-11-12: "Creative Commerce Studio - Product Spotlights" (`ddcda008-3dd4-4d28-875b-dc8148fbc814`) ran successfully through the run-workflow MCP (`run_workflow_submit` / `run_workflow_get_status`) with one product URL override. It returned a PNG cutout plus desktop (1200×896) and mobile (896×1200) JPEG composites as signed links valid for about 1 hour. Output names came from the background image, so match by node ID. The backend's own sign-in has not yet been run live.

## Sharing this workflow

Only publish an export that is portable and that you have the rights to share. Before you share it, remove embedded private assets, signed URLs, tenant IDs, credentials and destination IDs. Fonts and templates must be re-attached by whoever imports it.
