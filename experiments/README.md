# Homepage hero experiment

This project is wired for Adobe's AEM Experimentation plugin. Create the
experiment content in DA.live using the following metadata on the control page:

| Key | Value |
| --- | --- |
| `Experiment` | `homepage-hero-2026-09` |
| `Experiment Variants` | `/index, /experiments/homepage-hero-2026-09` |

The control is the normal `/index` page. Create the challenger by duplicating
the page and changing only the hero content, then publish it at
`/experiments/homepage-hero-2026-09`. Use the AEM Sidekick experiment panel to
preview both variants before starting the 50/50 test.

The intended run is two weeks for all visitors, using the storefront's existing
primary conversion metric. Do not add credentials or tokens to this repository.
