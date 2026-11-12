# ⚠️ Production readiness — read this first

**Creative Commerce Studio is a contest demo, not a production integration.** The parts that touch Adobe services currently depend on one person's local sign-in and on fallbacks. Before anyone else installs or relies on this extension, the items below must be in place.

## What is demo-only today

| Area | Current (demo) behaviour | Why it is not production-ready |
|---|---|---|
| **Firefly Creative Production** | `FFCPE_MODE=bridge`. A **local bridge script on the operator's computer** signs in to Adobe's run-workflow MCP with the **operator's own Adobe account** and runs every job. | Every run uses one person's identity, permissions and quota. Runs only happen while that computer is on and `npm run bridge` is running. The run-workflow MCP is a development-time agent service, and Adobe only accepts sign-ins from local tools or Claude's hosted callback. Hosted sign-in (`FFCPE_MODE=mcp`) is refused with `redirect_uri must be a loopback (localhost) URL or the Claude hosted callback.` |
| **Image delivery** | `DELIVERY_MODE=public`. Approved images are stored in App Builder Files `public/` and inserted by public URL. | They are not managed assets: no DAM governance, rights metadata, approvals, renditions or Dynamic Media optimization. Deleting the App Builder workspace deletes the images. |
| **Box** | OAuth app in a **free developer account**, enabled by hand in that account's Platform Apps. |
| **Google Drive** | Google OAuth client in **Testing** mode (listed test users only; sign-ins expire after 7 days). | `drive.readonly` is a Google **restricted** scope, so a public app needs Google's verification, including an independent security assessment (CASA). | A customer's enterprise Box admin must approve the app. The redirect URI points at a **Stage** App Builder workspace. |
| **App Builder backend** | Deployed to the **Stage** workspace of org "Adobe Demo System" from a personal laptop. | No production workspace, no CI/CD, no secret rotation, no monitoring or alerting. |
| **Distribution** | Registered by hand in one site's Workspace library sheet. | No marketplace listing, multi-tenant configuration, security review or support model. |

## What it takes to go to production

### 1. Firefly Creative Production API access (the main blocker)

Replace the local bridge with `FFCPE_MODE=api`. The code is already built and tested; switching is a configuration change only.

| Requirement | Who | Where |
|---|---|---|
| **Firefly Services / Creative Production API entitlement** in the org that owns the published workflows. Browser (user) access to Firefly is **not** enough. | Adobe account team / org System Admin | Admin Console → Products |
| **Developer role** for the person creating the credential, on the product profile that includes the Firefly API | Org System Admin or Product Admin | Admin Console → Users → (user) → Developer |
| **Developer Console project** in the Firefly org, with an **OAuth Server-to-Server** credential for the Firefly Services / Creative Production API on a product profile. A blank project is fine; it doesn't have to be App Builder. | Developer | developer.adobe.com/console |
| **Workflow access for the technical account.** The credential runs as a technical account, not as a person, so the published workflow must be runnable by that account (org-wide publish or sharing). | Workflow owner | Firefly → Creative Production |
| **Quota and billing:** confirm per-run cost, rate limits (`x-ratelimit-*`) and who pays | Account team | — |
| Backend settings: `FFCPE_MODE=api`, `FFCPE_CLIENT_ID`, `FFCPE_CLIENT_SECRET`, `FFCPE_IMS_ORG_ID` (and `FFCPE_IMS_USER_ID` if required) | Operator | App Builder `.env` → `aio app deploy` |

There is an alternative, but it isn't available today: the run-workflow MCP team could allowlist the backend's hosted redirect URI (`…/firefly-auth-callback`). That would let each author sign in with their own account (`FFCPE_MODE=mcp`, already built). This is a policy decision by that team.

### 2. Product Visuals (AEM Assets) delivery

Switch to `DELIVERY_MODE=aem`.

| Requirement | Who | Where |
|---|---|---|
| AEM as a Cloud Service environment behind Commerce Product Visuals, with **Dynamic Media with OpenAPI** enabled | AEM admin | Cloud Manager |
| **Developer Console project** in the AEM org, with an **OAuth Server-to-Server** credential that has AEM API access | Developer (Developer role in that org) | developer.adobe.com/console |
| The AEM environment must **allow that technical account**: API access configuration for the client ID, plus a product profile or group with write and approve rights on the target DAM folder | AEM / Cloud Manager admin | Cloud Manager, AEM user admin |
| Target folder (`AEM_TARGET_FOLDER`) and approval policy. The backend marks renditions `dam:status=approved`; production may require human approval in AEM instead. | DAM owner | AEM Assets |
| Backend settings: `AEM_AUTHOR_URL`, `AEM_DELIVERY_URL`, `AEM_CLIENT_ID`, `AEM_CLIENT_SECRET`, `AEM_SCOPES` | Operator | App Builder `.env` |

### 3. Box

| Requirement | Who |
|---|---|
| A Box app (OAuth 2.0 user authentication), **read-only scope**, owned by the customer or the publisher | Developer |
| **Enterprise admin approval** in each customer's Box: Admin Console → Integrations → Platform Apps Manager | Customer's Box admin |
| A production redirect URI (`<production backend>/box-auth-callback`) and an agreed campaign folder per site | Developer / customer |

### 3b. Google Drive

| Requirement | Who |
|---|---|
| A Google Cloud project owned by the publisher or customer, with the Drive API enabled | Developer |
| OAuth consent screen moved from **Testing** to **In production**, with **app verification** for the restricted `drive.readonly` scope: brand verification, privacy policy, scope justification, demo video and an annual **CASA security assessment**. That usually takes weeks. | Publisher + security |
| Alternative that avoids the restricted scope: switch to `drive.file` with the Google Picker, so authors pick files rather than browse a folder. That's a code change. | Developer |
| Google Workspace customers: admins allow the app (Admin console → Security → API controls → App access control) | Customer's Workspace admin |
| A production redirect URI (`<production backend>/gdrive-auth-callback`) and an agreed campaign folder per site | Developer / customer |

### 4. App Builder backend

| Requirement | Who |
|---|---|
| App Builder entitlement and the **Developer role** in the org that hosts the backend | Org admin |
| Deploy to a **Production** workspace (not Stage), from CI/CD rather than a laptop | Developer / DevOps |
| Secrets (`TOKEN_ENCRYPTION_KEY`, Box, Firefly and AEM credentials) in a managed secret store, with a rotation plan | DevOps / Security |
| Logging, monitoring and alerting. Data retention: job records 30 days, App Builder Files cleanup. | DevOps |
| `ALLOWED_ORIGINS` for every site and branch preview origin (Workspace runs the plugin on `<branch>--<site>--<org>.preview.da.live`) and `IMS_ALLOWED_ORGS` to restrict who can use the install | Operator |
| Remove `FFCPE_MODE=bridge` and `BRIDGE_TOKEN`, so the bridge actions refuse every call | Operator |

### 5. Experience Workspace and distribution

| Requirement | Who |
|---|---|
| Confirm the accepted packaging and registration route (library plugin, marketplace listing, UI Extensibility) and its review requirements | Publisher |
| Per-site configuration (`creative-commerce-studio.backend-url`) and a library sheet entry per site | Site admin |
| Confirm the Workspace IMS client ID accepted by the backend (`IMS_ALLOWED_CLIENT_IDS`, currently `darkalley`) | Developer |
| Security and privacy review: the token flows, CORS, stored Box and Firefly tokens, and public image URLs | Security |

### 6. Org alignment

Workspace, App Builder, Firefly and AEM can live in **different IMS orgs**, as they do today: Adobe Demo System hosts App Builder, and Firefly is elsewhere. Each service's credential must come from a Developer Console project **in the org that owns that service**. One App Builder backend can hold credentials from several orgs in its `.env`.

### 7. Content and rights

- Use only packshots and backgrounds you have the rights to use and publish. The demo catalog images are third-party (stihlusa.com).
- Agree who approves renditions before they go live. Publishing is still the normal Workspace action.

## Switching off demo mode (checklist)

1. Firefly API credential in place: set `FFCPE_MODE=api` plus its four values, deploy, and run one test job.
2. AEM credential in place: set `DELIVERY_MODE=aem` plus the `AEM_*` values, deploy, and accept one job.
3. Remove `BRIDGE_TOKEN`, stop the local bridge, and delete `~/.ccs-bridge` on the operator's computer.
4. Move to a Production App Builder workspace; update the Box redirect URI, `config.json` `backend-url` and `ALLOWED_ORIGINS`.
5. Have the customer's Box admin approve the app.
