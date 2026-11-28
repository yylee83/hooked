// The iPhone splash screens: the picture iPhone shows while Hooked opens from the Home Screen. iPhone only uses one
// whose size matches the screen exactly, so there's one per screen size (CSS width × height, and pixels per point).
// Made by scripts/make-app-icons.mjs; listed in app/layout.js.
export const SPLASH_SCREENS = [
  { width: 440, height: 956, ratio: 3 }, // 16 Pro Max, 17 Pro Max
  { width: 420, height: 912, ratio: 3 }, // Air
  { width: 402, height: 874, ratio: 3 }, // 16 Pro, 17, 17 Pro
  { width: 430, height: 932, ratio: 3 }, // 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  { width: 393, height: 852, ratio: 3 }, // 14 Pro, 15, 15 Pro, 16, 16e
  { width: 428, height: 926, ratio: 3 }, // 12 Pro Max, 13 Pro Max, 14 Plus
  { width: 390, height: 844, ratio: 3 }, // 12, 12 Pro, 13, 13 Pro, 14
  { width: 375, height: 812, ratio: 3 }, // X, XS, 11 Pro, 12 mini, 13 mini
  { width: 414, height: 896, ratio: 3 }, // XS Max, 11 Pro Max
  { width: 414, height: 896, ratio: 2 }, // XR, 11
  { width: 375, height: 667, ratio: 2 }, // SE, 8
].map((s) => ({ ...s, file: `splash/iphone-${s.width}x${s.height}@${s.ratio}x.png` }));

// For Next.js's appleWebApp.startupImage.
export const startupImages = SPLASH_SCREENS.map((s) => ({
  url: `/${s.file}`,
  media: `(device-width: ${s.width}px) and (device-height: ${s.height}px) and (-webkit-device-pixel-ratio: ${s.ratio}) and (orientation: portrait)`,
}));
