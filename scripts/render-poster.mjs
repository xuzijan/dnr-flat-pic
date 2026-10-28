import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initWasm, Resvg } from "../runtime/node_modules/@resvg/resvg-wasm/index.mjs";
import { DOMParser } from "../runtime/node_modules/@xmldom/xmldom/lib/index.js";
import { preparePhotoRaster } from "./lib/raster.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const layoutPath = path.join(rootDir, "assets", "poster-layout.json");
const shapePath = path.join(rootDir, "assets", "ios-continuous-rounded-square.svg");
const wasmPath = path.join(rootDir, "runtime", "node_modules", "@resvg", "resvg-wasm", "index_bg.wasm");

let wasmInitPromise;

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (["--photo", "--square-source-png", "--output"].includes(arg)) {
      const value = argv[++i];
      if (!value) fail(`Missing value for ${arg}.`);
      args[arg.slice(2)] = value;
    } else {
      fail("Usage: node scripts/render-poster.mjs --photo <jpg|png> --square-source-png <png> --output <png>");
    }
  }
  if (!args.photo || !args["square-source-png"] || !args.output) {
    fail("--photo, --square-source-png, and --output are required.");
  }
  return args;
}

function mimeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  fail(`Unsupported raster input: ${filePath}. Use PNG, JPG, or JPEG.`);
}

function dataUrl(buffer, mime) {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function parseShape(xml) {
  const doc = new DOMParser().parseFromString(xml, "image/svg+xml");
  const paths = doc.documentElement.getElementsByTagName("path");
  if (paths.length !== 1 || !paths[0].getAttribute("d")) {
    fail("The continuous rounded-square asset must contain exactly one path with d.");
  }
  return paths[0].getAttribute("d");
}

function assertLayout(layout) {
  const expected = [
    layout?.canvas?.width === 900,
    layout?.canvas?.height === 1200,
    layout?.photo?.x === 0,
    layout?.photo?.y === 0,
    layout?.photo?.width === 900,
    layout?.photo?.height === 600,
    layout?.photo?.fit === "cover",
    layout?.photo?.align === "xMidYMid",
    layout?.lower?.x === 0,
    layout?.lower?.y === 600,
    layout?.lower?.width === 900,
    layout?.lower?.height === 600,
    layout?.lower?.fill === "#F5F2EB",
    layout?.icon?.x === 290,
    layout?.icon?.y === 740,
    layout?.icon?.width === 320,
    layout?.icon?.height === 320,
    layout?.icon?.source === "png",
  ];
  if (expected.some((value) => !value)) fail("poster-layout.json does not match the locked poster-v1 geometry.");
}

async function initRendererWasm() {
  if (!wasmInitPromise) {
    wasmInitPromise = fs.readFile(wasmPath).then((bytes) => initWasm(bytes));
  }
  return wasmInitPromise;
}

function buildPosterSvg(layout, shape, photoUrl, iconUrl) {
  const { canvas, photo, lower, icon } = layout;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}" shape-rendering="geometricPrecision">
  <defs>
    <path id="icon-shape" d="${shape}" transform="translate(${icon.x} ${icon.y}) scale(${icon.width / 1024} ${icon.height / 1024})"/>
    <clipPath id="photo-clip" clipPathUnits="userSpaceOnUse"><rect x="${photo.x}" y="${photo.y}" width="${photo.width}" height="${photo.height}"/></clipPath>
    <clipPath id="icon-clip" clipPathUnits="userSpaceOnUse"><use href="#icon-shape" xlink:href="#icon-shape"/></clipPath>
  </defs>
  <rect x="${lower.x}" y="${lower.y}" width="${lower.width}" height="${lower.height}" fill="${lower.fill}"/>
  <g clip-path="url(#photo-clip)">
    <image href="${photoUrl}" xlink:href="${photoUrl}" x="${photo.x}" y="${photo.y}" width="${photo.width}" height="${photo.height}" preserveAspectRatio="${photo.align} slice"/>
  </g>
  <g clip-path="url(#icon-clip)">
    <image href="${iconUrl}" xlink:href="${iconUrl}" x="${icon.x}" y="${icon.y}" width="${icon.width}" height="${icon.height}" preserveAspectRatio="xMidYMid meet"/>
  </g>
</svg>
`;
}

const args = parseArgs(process.argv.slice(2));
const photoPath = path.resolve(args.photo);
const iconPath = path.resolve(args["square-source-png"]);
const outputPath = path.resolve(args.output);
const [layoutText, shapeText, photo, icon] = await Promise.all([
  fs.readFile(layoutPath, "utf8"),
  fs.readFile(shapePath, "utf8"),
  fs.readFile(photoPath),
  fs.readFile(iconPath),
]);
const layout = JSON.parse(layoutText);
assertLayout(layout);
if (icon.length < 24 || icon.readUInt32BE(0) !== 0x89504e47 || icon.readUInt32BE(4) !== 0x0d0a1a0a) {
  fail("--square-source-png must point to a valid PNG.");
}
if (icon.readUInt32BE(16) !== icon.readUInt32BE(20)) {
  fail(`--square-source-png must be square; received ${icon.readUInt32BE(16)}x${icon.readUInt32BE(20)}.`);
}

const shape = parseShape(shapeText);
const normalizedPhoto = preparePhotoRaster(photo, mimeFor(photoPath));
const posterSvg = buildPosterSvg(layout, shape, dataUrl(normalizedPhoto.buffer, normalizedPhoto.mime), dataUrl(icon, "image/png"));
await initRendererWasm();
const renderer = new Resvg(posterSvg, { fitTo: { mode: "original" }, imageRendering: 0, shapeRendering: 2 });
const rendered = renderer.render();
if (rendered.width !== 900 || rendered.height !== 1200) {
  fail(`Poster renderer returned ${rendered.width}x${rendered.height}; expected 900x1200.`);
}
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, rendered.asPng());
if (typeof rendered.free === "function") rendered.free();
if (typeof renderer.free === "function") renderer.free();
console.log(JSON.stringify({ output: outputPath, width: 900, height: 1200, source: { photo: photoPath, icon: iconPath } }));
