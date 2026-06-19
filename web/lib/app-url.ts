export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://web-sigma-three-32.vercel.app").replace(/\/$/, "");

export const APP_HOST = (() => {
  try {
    return new URL(APP_URL).host;
  } catch {
    return "web-sigma-three-32.vercel.app";
  }
})();
