# FFCPE workflow: product packshot → desktop + mobile placements

This recipe is built in **Firefly Creative Production** (Firefly web → Creative Production → custom workflows) and published so the backend can call it through the **Workflow API**. No generative imagery: the product photo is cut out and placed, never re-drawn.

## Recipe (v1)

| # | Node | Settings |
|---|------|----------|
| 1 | Input asset | One image per execution (PNG/JPEG packshot). Must accept a URL input — the backend passes a 1-hour presigned URL to the exact Box file version. |
| 2 | Remove background | Skip if your packshots are already transparent. |
| 3 | Photoshop template merge — **desktop** | PSD 1600×900, smart object layer named `product`, approved background layer, product fit "contain" with safe margins. No baked-in text, price or CTA. |
| 4 | Photoshop template merge — **mobile** | PSD 800×1000, same layer names. Compose intentionally; do not center-crop the desktop. |
| 5 | Export | JPEG (quality ~85) or PNG. **Output names must contain `desktop` and `mobile`** (or change `FFCPE_OUTPUT_MATCH`). |

Prefer two simple templates over a multi-artboard file until you have confirmed how many outputs it produces and how they are named.

## Publish and record the contract

1. Validate the workflow on one authorized packshot and inspect both outputs: whole product visible, clean edges, no distortion, correct size.
2. Publish the workflow and note its **workflow ID** → `FFCPE_WORKFLOW_ID`.
3. In Adobe Developer Console, add an **OAuth Server-to-Server** credential with the Firefly Creative Production / Firefly Services API to your App Builder project → `FFCPE_CLIENT_ID`, `FFCPE_CLIENT_SECRET`. The documented scopes are `openid,AdobeID,session,additional_info,read_organizations,firefly_api,ff_apis`.
4. Open the **authenticated Workflow API reference** for your tenant and record:
   - the base URL → `FFCPE_API_BASE`
   - the `POST /batch/execute` body (how a workflow input and its URL are named) → `FFCPE_EXECUTE_TEMPLATE`
   - where outputs appear in `GET /batch/{batchId}/executions` (the backend collects every `https` `url`/`href` with its `name`)
5. Run one small authorized job (it may be billable) and confirm the plugin reaches **ready-for-review**.

`FFCPE_EXECUTE_TEMPLATE` placeholders: `{{workflowId}}`, `{{sourceUrl}}`, `{{sku}}`, `{{jobId}}`, `{{productName}}`, `{{sourceName}}`. Values are JSON-escaped. An unknown placeholder fails the job before anything is sent.

## Tested versions

Not yet run end-to-end. Record the node versions, API version (`api-version` header, default `1.0`) and date here after the first successful run.

## Sharing this workflow

Only publish an export that is portable and that you have the rights to share. Before you share it, remove embedded private assets, signed URLs, tenant IDs, credentials and destination IDs. Fonts and templates must be re-attached by whoever imports it.
