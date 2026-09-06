const detectedPortraitFiles = import.meta.glob(
  "/public/picture/chara/*/*.{png,jpg,jpeg,webp,gif,bmp,avif,svg}"
);

export const portraitPublicPaths = Object.freeze(
  Object.keys(detectedPortraitFiles)
);
