# Scene images

Put each scene image a workflow needs here, at the path that `workflows.json` gives as its `file`. Scene images are the backgrounds and placement masks for Campaign Looks. Name each file after its look and its part, so every name is unique:

```
looks/
  workshop/
    workshop-desktop-background.jpg   1200 × 896, JPEG
    workshop-desktop-mask.png         1200 × 896, PNG: white = where the product goes, black = protected
    workshop-mobile-background.jpg    896 × 1200, JPEG
    workshop-mobile-mask.png          896 × 1200, PNG
```

Then run `npm run workflows:check` to validate everything, and `npm run workflows:upload` to upload the images and `workflows.json` to the backend's private storage. The upload command checks:

- every file is present
- every file really is a PNG or JPEG, and its extension matches. Renaming `.png` to `.jpg` doesn't convert an image; convert it instead, for example `sips -s format jpeg -s formatOptions 92 in.png --out out.jpg` on a Mac.
- masks are PNG
- each mask is the same size as its background

Uploads apply to the next run, with no redeploy.

Images in this folder are **not committed** (see `.gitignore`). Keep the originals wherever your team stores approved assets.
