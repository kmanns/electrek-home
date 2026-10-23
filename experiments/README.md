# Homepage hero experiment

This project is wired for Adobe's AEM Experimentation plugin. Create the
experiment content in DA.live using the following metadata on the control page
(`/index`):

| Key | Value |
| --- | --- |
| `Experiment` | `homepage-hero-2026-09` |
| `Experiment Variants` | `/experiments/homepage-hero-2026-09/` |

- **List only the challenger page(s).** The page carrying the metadata is the
  control automatically; every URL listed is an extra challenger
  (`challenger-1`, `challenger-2`, …). Listing `/index` would add a duplicate
  of the control and split traffic three ways.
- **Use the exact published URL of the challenger.** A DA document named
  `index` inside a folder is served at the folder path **with a trailing
  slash**: `experiments/homepage-hero-2026-09/index` →
  `/experiments/homepage-hero-2026-09/`. Without the slash the plugin's fetch
  404s and challenger visitors silently get the control. Open the URL in a
  browser to confirm it loads before publishing the control.

## Creating the challenger

Copy the **current** published `/index` page in DA to
`experiments/homepage-hero-2026-09/index` and change only the hero content.
Remove the `Experiment` and `Experiment Variants` rows from the copy's
metadata. Re-copy whenever the homepage changes outside the hero during the
test, so the variants differ only in the hero.

Preview and publish both pages; the experiment starts once the control is
published with the metadata above.

## Checking the variants

Experiments run only on the live host (`main--electrek-home--kmanns.aem.live`).
On preview (`.aem.page`) and localhost the engine is deliberately skipped to
keep it off the render path (see `scripts/experiment-loader.js`), so the
Sidekick experiment panel shows no experiments there.

To check each variant on live, force it with the query parameter:

- `https://main--electrek-home--kmanns.aem.live/?experiment=homepage-hero-2026-09/control`
- `https://main--electrek-home--kmanns.aem.live/?experiment=homepage-hero-2026-09/challenger-1`

The challenger should show its own hero and otherwise match the control. If it
shows the control hero, the variant URL is wrong (check the browser console for
a 404 on the variant path).

If the site moves to a custom production domain, update `prodHost` in
`scripts/scripts.js`, or experiments will stop running there.

## Test plan

The intended run is two weeks for all visitors, 50/50, using the storefront's
existing primary conversion metric. Do not add credentials or tokens to this
repository.
