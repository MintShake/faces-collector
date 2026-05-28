import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const outDir = new URL("../web/public/miniapp/", import.meta.url);
const bg = "#07121f";
const coral = "#ff4f7b";
const cyan = "#18c8d2";
const sun = "#ffcf4a";
const leaf = "#41d68d";

await mkdir(outDir, { recursive: true });

function portraitCard(x, y, size, rotate, fill, stroke = "#ffffff", opacity = 1) {
  const r = size * 0.16;
  const face = size * 0.32;
  return `
    <g transform="translate(${x} ${y}) rotate(${rotate} ${size / 2} ${size / 2})" opacity="${opacity}">
      <rect width="${size}" height="${size}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${size * 0.045}"/>
      <circle cx="${size * 0.5}" cy="${size * 0.39}" r="${face * 0.48}" fill="rgba(7,18,31,0.52)"/>
      <path d="M${size * 0.25} ${size * 0.76}c${size * 0.1}-${size * 0.22} ${size * 0.4}-${size * 0.22} ${size * 0.5} 0" fill="rgba(7,18,31,0.52)"/>
      <circle cx="${size * 0.35}" cy="${size * 0.34}" r="${size * 0.035}" fill="#fff" opacity=".85"/>
      <circle cx="${size * 0.66}" cy="${size * 0.64}" r="${size * 0.035}" fill="#fff" opacity=".7"/>
    </g>`;
}

function svg(width, height, body) {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${coral}"/>
          <stop offset=".48" stop-color="${sun}"/>
          <stop offset="1" stop-color="${cyan}"/>
        </linearGradient>
        <linearGradient id="deep" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#07121f"/>
          <stop offset=".58" stop-color="#102a47"/>
          <stop offset="1" stop-color="#0b5261"/>
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="28" stdDeviation="26" flood-color="#000814" flood-opacity=".35"/>
        </filter>
      </defs>
      <rect width="100%" height="100%" fill="${bg}"/>
      <path d="M-80 ${height * 0.22} C ${width * 0.22} ${height * 0.04}, ${width * 0.38} ${height * 0.5}, ${width + 70} ${height * 0.18}" fill="none" stroke="${cyan}" stroke-width="${height * 0.08}" opacity=".22"/>
      <path d="M-70 ${height * 0.78} C ${width * 0.28} ${height * 0.56}, ${width * 0.58} ${height * 1.03}, ${width + 80} ${height * 0.74}" fill="none" stroke="${coral}" stroke-width="${height * 0.1}" opacity=".2"/>
      <g opacity=".18">
        ${Array.from({ length: 18 }, (_, i) => {
          const x = (i * 91) % width;
          const y = (i * 57) % height;
          return `<rect x="${x}" y="${y}" width="2" height="${height}" fill="#fff"/>`;
        }).join("")}
      </g>
      ${body}
    </svg>`);
}

const icon = svg(1024, 1024, `
  <g filter="url(#shadow)">
    ${portraitCard(266, 260, 380, -12, coral)}
    ${portraitCard(342, 300, 380, 4, sun)}
    ${portraitCard(420, 340, 380, 15, cyan)}
    <rect x="232" y="706" width="560" height="132" rx="66" fill="#fff"/>
    <text x="512" y="792" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="76" font-weight="900" fill="${bg}">Faces</text>
  </g>
  <circle cx="242" cy="218" r="34" fill="${leaf}"/>
  <circle cx="800" cy="242" r="22" fill="${sun}"/>
`);

const splash = svg(1200, 800, `
  <g filter="url(#shadow)">
    ${portraitCard(352, 190, 270, -14, coral)}
    ${portraitCard(466, 172, 270, 1, sun)}
    ${portraitCard(578, 190, 270, 14, cyan)}
  </g>
  <text x="600" y="560" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="116" font-weight="900" fill="#fff">Faces</text>
  <text x="600" y="622" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="800" fill="rgba(255,255,255,.76)">your PFP eras, remembered</text>
`);

const embed = svg(1200, 630, `
  <g filter="url(#shadow)">
    ${portraitCard(720, 105, 250, -14, coral)}
    ${portraitCard(815, 132, 250, 1, sun)}
    ${portraitCard(910, 160, 250, 14, cyan)}
  </g>
  <rect x="64" y="92" width="138" height="42" rx="21" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.22)"/>
  <text x="133" y="120" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="900" fill="#fff">Faces</text>
  <text x="64" y="244" font-family="Arial, Helvetica, sans-serif" font-size="86" font-weight="900" fill="#fff">Your PFP</text>
  <text x="64" y="338" font-family="Arial, Helvetica, sans-serif" font-size="86" font-weight="900" fill="#fff">timeline</text>
  <text x="68" y="410" font-family="Arial, Helvetica, sans-serif" font-size="31" font-weight="800" fill="rgba(255,255,255,.76)">See the eras, glow-ups, jokes, and resets.</text>
  <rect x="68" y="462" width="274" height="58" rx="29" fill="url(#brand)"/>
  <text x="205" y="500" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="900" fill="${bg}">Open in Farcaster</text>
`);

await Promise.all([
  sharp(icon).png({ compressionLevel: 9 }).toFile(fileURLToPath(new URL("icon.png", outDir))),
  sharp(splash).png({ compressionLevel: 9 }).toFile(fileURLToPath(new URL("splash.png", outDir))),
  sharp(embed).png({ compressionLevel: 9 }).toFile(fileURLToPath(new URL("embed.png", outDir)))
]);

console.log("Generated miniapp assets.");
