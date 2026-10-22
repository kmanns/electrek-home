# Requirements: Hero block — image or video background

## Task
Extend the `hero` block so the background can be either an image (as today) or a
video, keeping the existing text overlay (navy gradient scrim, torch-accent rule,
uppercase H1, CTA button) unchanged.

## Current State
- `blocks/hero/hero.js` is empty — the hero is CSS-only.
- `blocks/hero/hero.css`: authored `<picture>` is absolutely positioned behind
  the text (`z-index: -2`), `::after` navy gradient scrim (`z-index: -1`),
  min-height 320px (420px ≥ 900px).
- `blocks/hero/_hero.json` (DA): single cell with `image`, `alt`, `text` fields.
- Homepage hero is the LCP element; last PR Lighthouse score: 93–94.
- Homepage hero A/B test (`homepage-hero-2026-09`) is configured but **not running**.

## Decisions (from user, 2026-10-21)
| Topic | Decision |
| --- | --- |
| Video source | **Both** — MP4 links (e.g. AEM Assets) **and** YouTube/Vimeo links |
| Playback | Autoplay, muted, loop, with a **pause/play button** (WCAG 2.2.2) |
| Fallback | **Image** for phones **and** for `prefers-reduced-motion` users |
| A/B test | Not running — safe to ship |

## Functional Requirements
1. Image-only heroes render exactly as today (no visual change).
2. An author can add a video link in the hero; the block plays it as a muted,
   looping background behind the existing overlay.
3. The hero image acts as the poster / fallback; it shows while the video
   loads, on phones, and for reduced-motion users.
4. A visible, keyboard-accessible pause/play button controls the video
   (MP4 and YouTube/Vimeo).
5. The video link itself is not shown as a link or button in the overlay; the
   CTA button keeps working.
6. Page speed: the video must not delay the LCP image; target no Lighthouse
   regression on the homepage.

## Open Items for Phase 2 (research)
- How DA/AEM Assets video links appear in the authored HTML (URL shape for
  AEM Assets delivery video), to detect MP4 links reliably.
- Whether the project already auto-converts video links (e.g. an embed/video
  auto-block in `scripts.js`) that would conflict.
- YouTube/Vimeo background embed parameters and pause/play control without
  third-party libraries.
- What breakpoint counts as "phone" (match the project's existing breakpoints).

## Phase 1: Complete ✅
Date: 2026-10-21 19:49 UTC

## Research Findings
- **Codebase:** no existing video/embed block; nothing in `scripts.js` converts
  video links. `decorateButtons` only buttonizes **bold/italic** links, so a
  plain video link stays a plain `<a>` and won't collide with the CTA.
  Hero JS runs during the eager (LCP) phase; main breakpoint is 900px.
- **AEM Assets (DA plugin):** the picker inserts videos as an *embed block*
  containing a link to the **player URL**
  `https://delivery-pXXXX-eYYYY.adobeaemcloud.com/adobe/assets/{assetId}/play`.
  That endpoint returns player HTML (iframe-only); documented params are
  `mode`, `language`, `viewerPreset` — no mute/loop/controls/pause API.
- **Same asset as MP4:** `/adobe/assets/{assetId}/original/as/{seoName}` returns
  the originally uploaded binary — a native `<video>` source when the upload
  is an MP4. HLS/DASH (`/manifest.m3u8|mpd`) would need a third-party player
  library on non-Safari browsers, so it's excluded (vanilla JS rule).
- **Reference:** AEM Block Collection `video` block — YouTube/Vimeo detection
  and background params (`mute`, `loop`, `controls=0`, `playsinline`; Vimeo
  `background=1`), IntersectionObserver + `prefers-reduced-motion` handling.
- Commerce docs MCP unavailable (no Adobe IMS login); used public aem.live,
  Experience League, and the Assets Delivery OpenAPI spec instead.

## Phase 2: Architectural Plan

### Authoring (DA)
Single hero cell, as today, plus one optional plain link:

| hero |
| --- |
| ![hero image] *(poster + phone/reduced-motion fallback)* |
| # Headline |
| **[Shop the catalog](/apparel)** *(bold = CTA button, unchanged)* |
| https://…/video-link *(plain link on its own line → background video)* |

Accepted video links: direct `.mp4`/`.webm`, AEM Assets
`/adobe/assets/{id}/play` or `/original/…`, YouTube (`youtube.com/watch`,
`youtu.be`, `/shorts/`), Vimeo (`vimeo.com/{id}`). Authors copy the AEM Assets
link out of the picker's embed into the hero cell.

### Behavior (`blocks/hero/hero.js`, new)
1. Find the first plain link matching a video pattern; remove its paragraph
   from the overlay. **No video link → no DOM changes** (image heroes identical).
2. Add `hero-video` class; the authored `<picture>` stays as poster/fallback.
3. Play only when viewport ≥ 900px **and** `prefers-reduced-motion` is off;
   otherwise stop (image only, no video bytes downloaded).
4. Defer video creation until after the window `load` event, so the LCP image
   is never competing with the video.
5. **MP4 / AEM Assets** → `<video muted loop playsinline autoplay
   preload="none">`; AEM Assets player URLs rewritten to
   `/adobe/assets/{id}/original/as/hero.mp4`. Fades in over the image on
   `playing`; on error the image simply stays.
6. **YouTube** → `youtube-nocookie.com/embed/{id}?autoplay=1&mute=1&loop=1&playlist={id}&controls=0&playsinline=1&rel=0&enablejsapi=1`.
   **Vimeo** → `player.vimeo.com/video/{id}?background=1&dnt=1`. Iframes are
   cover-sized (16:9 scaled to fill), `aria-hidden`, `tabindex=-1`,
   `pointer-events: none`.
7. **Pause/play button** (bottom-right, native `<button>`, label toggles
   "Pause background video" / "Play background video"). MP4 via
   `video.pause()/play()`; YouTube via `postMessage` `pauseVideo`/`playVideo`;
   Vimeo via `postMessage` `{method: 'pause'|'play'}`.

### Files
- `blocks/hero/hero.js` — new decorator (~150 lines, `createElement` only).
- `blocks/hero/hero.css` — video/iframe layer (same z-index slot as the
  picture, under the scrim), fade-in, pause button. Existing rules untouched.
- `blocks/hero/README.md` — new authoring guide.
- `_hero.json` — unchanged.

### Security
- Iframe URLs are built from a parsed video **ID** on a fixed host allowlist —
  never from the raw authored URL.
- Privacy-friendlier embeds: `youtube-nocookie.com`, Vimeo `dnt=1`.
- `postMessage` targets the exact embed origin, not `*`.

### Performance
- Phones never download video → mobile Lighthouse unaffected.
- Desktop: video starts only after `load`; `preload="none"`; poster = LCP.
- Caveat: AEM Assets `original` is the **uploaded file as-is** — authors should
  upload a web-optimized MP4 (≈1080p, H.264, no audio, ideally < 10 MB).

### Testing
- Lint. Browser: image-only hero pixel-identical to today; simulated hero with
  MP4, YouTube, Vimeo, and AEM Assets links; pause/play by mouse + keyboard;
  reduced-motion emulation and < 900px viewport show image only; overlay
  contrast unchanged. Page-speed check on the PR (needs the preview URL).
- Open: a real AEM Assets video link from your tenant to confirm the
  `original` rewrite end-to-end.

## Phase 2: Architectural Plan Presented
Date: 2026-10-21
Status: Approved

## Phase 2: Complete ✅
User Approved: Yes (as written)
Approval Date: 2026-10-21
Test video: public sample MP4; user will verify a real AEM Assets MP4 link later.

## Phase 3: Implementation Approach Selected
Approach: Option B (direct implementation from the approved plan)
Selection Date: 2026-10-21

## Phase 4: Implementation Started
Date: 2026-10-21

### Changes
- `blocks/hero/hero.js` — new decorator (video detection, players, toggle, fallbacks).
- `blocks/hero/hero.css` — `isolation: isolate` on `.hero` (fixes a pre-existing
  bug: authored hero images and the scrim painted *behind* the navy base and were
  invisible; no current page has a hero image, so nothing visible changes),
  video layer, cover-sized embeds, pause/play button, phone/reduced-motion hiding.
- `blocks/hero/README.md` — new authoring guide.

## Phase 4: Implementation Complete
Date: 2026-10-21

## Phase 4.5: Testing Decision
**Status:** Testing Completed (browser testing done during implementation, per project rules)
**Date:** 2026-10-21
**Results:**
- Lint passes (eslint, stylelint).
- Homepage hero (no video) unchanged.
- Link parsing: YouTube (`watch`, `youtu.be`), Vimeo, AEM Assets `/play` →
  `/original/as/hero.mp4`, direct files — correct; bold video link, non-video
  link, malformed YouTube ID — ignored (left as authored).
- Sample WebM: fades in over the image, plays muted/looping; pause button
  reachable by Tab; Enter pauses, Space resumes; labels toggle. Visual check:
  scrim + text over video correct.
- Phone 390px, tablet 768px, desktop + reduced motion: image only, no video
  element created. Reduced motion turned on mid-play: pauses + hides.
- **Not verifiable here:** YouTube ("confirm you're not a bot") and Vimeo
  (authorization error) refuse playback from this server's network; embed URLs
  built correctly. Verify playback + pause on the branch preview. Fake AEM
  Assets URL failed as expected (image stays); real asset to be checked by user.

## Phase 5: Archived
Date: 2026-10-22 00:44 UTC
Shipped via branch kmanns-hero-video-background (PR into main).
