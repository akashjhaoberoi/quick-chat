// Rasterizes the Quick Chat mark into PWA / favicon PNGs. Run: node scripts/generate-icons.mjs
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const mark = (bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs><linearGradient id="g" x1="48" y1="32" x2="480" y2="496" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#7C5CFF"/><stop offset="0.5" stop-color="#B45CF5"/><stop offset="1" stop-color="#FF5E7E"/></linearGradient></defs>
${bg ? '<rect width="512" height="512" rx="0" fill="url(#g)"/>' : ""}
<g transform="${bg ? "translate(96 96) scale(5)" : "translate(0 0) scale(8)"}">
${bg ? "" : '<path d="M32 5C17.1 5 6 15.6 6 29.5c0 7.3 3 13.6 8.1 18.1-.5 3.4-2 6.6-4.6 9.4 5.5.3 10.2-1.4 13.9-4.3 2.7.8 5.6 1.3 8.6 1.3 14.9 0 26-10.6 26-24.5S46.9 5 32 5Z" fill="url(#g)"/>'}
${bg ? '<path d="M32 5C17.1 5 6 15.6 6 29.5c0 7.3 3 13.6 8.1 18.1-.5 3.4-2 6.6-4.6 9.4 5.5.3 10.2-1.4 13.9-4.3 2.7.8 5.6 1.3 8.6 1.3 14.9 0 26-10.6 26-24.5S46.9 5 32 5Z" fill="#fff" opacity=".18"/>' : ""}
<path d="M35.6 14.5 22.8 32.4h8.6l-2.9 15.1 13-19h-8.7l2.8-14Z" fill="#fff"/>
<path d="M44 41.5c3 1.4 5.8 3.8 8.3 7.4" stroke="#fff" stroke-width="4.2" stroke-linecap="round"/>
</g></svg>`;

const full = Buffer.from(mark(true));
const bare = Buffer.from(mark(false));
writeFileSync("public/icons/logo.svg", mark(false));
for (const size of [192, 512]) {
  await sharp(full).resize(size, size).png().toFile(`public/icons/icon-${size}.png`);
  await sharp(full).resize(size, size).png().toFile(`public/icons/maskable-${size}.png`);
}
await sharp(full).resize(180, 180).png().toFile("public/icons/apple-touch-icon.png");
await sharp(bare).resize(96, 96).png().toFile("public/icons/badge-96.png");
await sharp(bare).resize(32, 32).png().toFile("public/icons/favicon-32.png");
await sharp(full).resize(64, 64).png().toFile("src/app/icon.png");
await sharp(full).resize(180, 180).png().toFile("src/app/apple-icon.png");
console.log("icons generated");
