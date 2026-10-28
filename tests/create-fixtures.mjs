import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initWasm, Resvg } from "../runtime/node_modules/@resvg/resvg-wasm/index.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(testDir, ".tmp", "fixtures");
const wasmPath = path.resolve(testDir, "..", "runtime", "node_modules", "@resvg", "resvg-wasm", "index_bg.wasm");

await fs.mkdir(fixtureDir, { recursive: true });
await initWasm(await fs.readFile(wasmPath));

async function render(name, svg) {
  const renderer = new Resvg(svg, { fitTo: { mode: "original" }, shapeRendering: 2, imageRendering: 0 });
  const rendered = renderer.render();
  await fs.writeFile(path.join(fixtureDir, name), rendered.asPng());
  if (typeof rendered.free === "function") rendered.free();
  if (typeof renderer.free === "function") renderer.free();
}

await render("photo.png", `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
  <rect width="800" height="500" fill="#DB6C3D"/>
  <rect y="290" width="800" height="210" fill="#112847"/>
  <circle cx="400" cy="230" r="90" fill="#F6C63D"/>
  <path d="M0 315H800" stroke="#E6B54A" stroke-width="10"/>
  <path d="M160 500V280M640 500V250" stroke="#08101F" stroke-width="22"/>
</svg>`);

await render("square-icon-source.png", `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#DB6C3D"/>
  <rect y="620" width="1024" height="404" fill="#112847"/>
  <circle cx="512" cy="450" r="170" fill="#F6C63D"/>
  <path d="M0 650H1024" stroke="#E6B54A" stroke-width="14"/>
  <path d="M230 1024V590M794 1024V560" stroke="#08101F" stroke-width="30"/>
</svg>`);

console.log(JSON.stringify({ fixtureDir }));
