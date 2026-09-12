const detectedPortraitFiles = import.meta.glob(
  "/public/picture/chara/*/*.{png,jpg,jpeg,webp,gif,bmp,avif,svg}",
  { query: "?url", import: "default" }
);

export const portraitPublicPaths = Object.freeze(
  Object.keys(detectedPortraitFiles)
);
