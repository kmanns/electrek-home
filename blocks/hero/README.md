# Hero

Full-width band with a text overlay (navy gradient scrim, torch-accent rule,
uppercase headline, CTA button) over an **image** or a **background video**.

## Authoring (DA table)

One cell. Everything except the headline is optional:

| hero |
| ---- |
| ![](hero.jpg) |
| # Everything the job needs. In stock, on account. |
| **[Shop the catalog](/apparel)** |
| https://delivery-p…adobeaemcloud.com/adobe/assets/urn:aaid:aem:…/play |

- **Image:** the background. With a video, it's also the placeholder while the
  video loads and the fallback on phones/tablets and for reduced motion —
  always add one alongside a video.
- **Headline:** `h1`.
- **CTA:** a **bold** link (italic or bold+italic for other button styles).
- **Video (optional):** a **plain** link — not bold or italic — on its own
  line. It's removed from the overlay and played behind it.

### Accepted video links

| Source | Example |
| --- | --- |
| AEM Assets | `https://delivery-pXXXX-eYYYY.adobeaemcloud.com/adobe/assets/{assetId}/play` |
| MP4 / WebM file | `https://…/hero-loop.mp4` |
| YouTube | `youtube.com/watch?v=…`, `youtu.be/…`, `youtube.com/shorts/…` |
| Vimeo | `vimeo.com/{id}` (unlisted: `vimeo.com/{id}/{hash}`) |

**AEM Assets:** the DA Assets picker inserts videos as an embed block — copy
its link into the hero cell instead. The hero plays the asset's **original
upload** (`…/original/as/hero.mp4`) natively, so upload a web-optimized MP4:
~1080p, H.264, no audio track needed, ideally under 10 MB. The asset must be
approved/published for delivery.

**YouTube/Vimeo:** play through the services' embed players
(`youtube-nocookie.com`; Vimeo `background=1&dnt=1`). The video must allow
embedding; Vimeo's background mode needs the owner's account to support it.

## Behavior

- No video link → the hero renders exactly as authored (CSS only).
- Video plays **muted and looping**, fading in over the image once it starts.
- **Pause/play button** bottom-right (keyboard accessible; label toggles
  "Pause/Play background video").
- Only on viewports **≥ 900px** with **reduced motion off**. Otherwise the
  image shows and no video is downloaded. If reduced motion is turned on or the
  window shrinks below 900px mid-play, the video pauses and hides.
- The video is created only after the page `load` event, so it never competes
  with the hero image for LCP.

## Notes

- `.hero` uses `isolation: isolate` so the image/video (`z-index: -2`) and
  scrim (`z-index: -1`) paint above the navy base color.
