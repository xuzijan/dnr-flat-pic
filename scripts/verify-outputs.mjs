import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { DOMParser } from "../runtime/node_modules/@xmldom/xmldom/lib/index.js";

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (["--poster", "--icon-svg", "--source-svg"].includes(arg)) {
      const value = argv[++i];
      if (!value) fail(`Missing value for ${arg}.`);
      args[arg.slice(2)] = value;
    } else {
      fail("Usage: node scripts/verify-outputs.mjs [--poster <png>] [--icon-svg <svg>] [--source-svg <svg>]");
    }
  }
  if (!args.poster && !args["icon-svg"] && !args["source-svg"]) {
    fail("Provide at least one output to verify.");
  }
  return args;
}

function parsePng(buffer, label) {
  if (buffer.length < 33 || buffer.readUInt32BE(0) !== 0x89504e47 || buffer.readUInt32BE(4) !== 0x0d0a1a0a) {
    fail(`${label} is not a PNG.`);
  }
  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  let interlace;
  const idat = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) fail(`${label} has a truncated PNG chunk.`);
    if (type === "IHDR") {
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      bitDepth = buffer[dataStart + 8];
      colorType = buffer[dataStart + 9];
      interlace = buffer[dataStart + 12];
    } else if (type === "IDAT") {
      idat.push(buffer.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }
  if (!width || !height || bitDepth !== 8 || colorType !== 6 || interlace !== 0 || !idat.length) {
    fail(`${label} must be non-interlaced 8-bit RGBA PNG for deterministic verification.`);
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bytesPerPixel = 4;
  const rowStride = width * bytesPerPixel;
  const rows = [];
  let cursor = 0;
  let previous = Buffer.alloc(rowStride);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y += 1) {
    const filter = raw[cursor++];
    const encoded = raw.subarray(cursor, cursor + rowStride);
    cursor += rowStride;
    const row = Buffer.alloc(rowStride);
    for (let x = 0; x < rowStride; x += 1) {
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
      const up = previous[x] || 0;
      const upLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] || 0 : 0;
      const value = encoded[x];
      if (filter === 0) row[x] = value;
      else if (filter === 1) row[x] = (value + left) & 255;
      else if (filter === 2) row[x] = (value + up) & 255;
      else if (filter === 3) row[x] = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[x] = (value + paeth(left, up, upLeft)) & 255;
      else fail(`${label} uses unsupported PNG filter ${filter}.`);
    }
    rows.push(row);
    previous = row;
  }
  return {
    width,
    height,
    pixel(x, y) {
      if (x < 0 || y < 0 || x >= width || y >= height) return null;
      const index = x * bytesPerPixel;
      return [...rows[y].subarray(index, index + 4)];
    },
  };
}

function parseSvg(text, label) {
  const errors = [];
  const doc = new DOMParser({ onError: (level, message) => errors.push(`${level}: ${message}`) }).parseFromString(text, "image/svg+xml");
  if (errors.some((entry) => entry.startsWith("error:") || entry.startsWith("fatal:"))) fail(`${label} is invalid XML: ${errors.join("; ")}`);
  if (!doc.documentElement || doc.documentElement.nodeName.toLowerCase() !== "svg") fail(`${label} has no SVG root.`);
  return doc;
}

function walk(root, callback) {
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    callback(node);
    if (node.childNodes) for (let i = 0; i < node.childNodes.length; i += 1) stack.push(node.childNodes[i]);
  }
}

async function verifySvg(filePath, mode) {
  const label = `${mode} SVG`;
  const text = await fs.readFile(filePath, "utf8");
  const doc = parseSvg(text, label);
  const root = doc.documentElement;
  const viewBox = (root.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
  if (viewBox.length !== 4 || viewBox.some((value) => !Number.isFinite(value)) || viewBox[2] <= 0 || viewBox[3] <= 0) {
    fail(`${label} has no usable viewBox.`);
  }
  let pathCount = 0;
  let imageCount = 0;
  let forbidden = 0;
  walk(root, (node) => {
    if (node.nodeType !== 1) return;
    const name = node.nodeName.toLowerCase();
    if (name === "path") pathCount += 1;
    if (name === "image") imageCount += 1;
    if (["filter", "lineargradient", "radialgradient", "foreignobject"].includes(name)) forbidden += 1;
    for (const attribute of ["opacity", "filter"]) if (node.hasAttribute(attribute)) forbidden += 1;
    for (const attribute of ["fill", "stroke"]) if ((node.getAttribute(attribute) || "").startsWith("url(")) forbidden += 1;
  });
  if (!pathCount) fail(`${label} has no path elements.`);
  if (imageCount || forbidden) fail(`${label} contains raster, filter, gradient, or opacity content.`);
  if (mode === "icon") {
    if (root.getAttribute("width") !== "1024" || root.getAttribute("height") !== "1024" || viewBox[2] !== 1024 || viewBox[3] !== 1024) {
      fail("icon SVG must be 1024x1024 with a 1024x1024 viewBox.");
    }
    const shape = root.getElementsByTagName("path");
    let hasShape = false;
    let hasClip = false;
    for (let i = 0; i < shape.length; i += 1) if (shape[i].getAttribute("id") === "icon-shape") hasShape = true;
    const clips = root.getElementsByTagName("clipPath");
    for (let i = 0; i < clips.length; i += 1) if (clips[i].getAttribute("id") === "icon-clip") hasClip = true;
    if (!hasShape || !hasClip) fail("icon SVG must contain the shared icon-shape and icon-clip.");
  } else if (root.getElementsByTagName("clipPath").length) {
    fail("source SVG must not add a rounded clip wrapper.");
  }
  return { mode, pathCount, bytes: Buffer.byteLength(text), viewBox };
}

const args = parseArgs(process.argv.slice(2));
const results = [];
if (args.poster) {
  const buffer = await fs.readFile(path.resolve(args.poster));
  const png = parsePng(buffer, "poster PNG");
  if (png.width !== 900 || png.height !== 1200) fail(`poster PNG must be 900x1200; received ${png.width}x${png.height}.`);
  const expected = [245, 242, 235];
  for (const [x, y] of [[0, 600], [899, 600], [0, 1199], [899, 1199], [450, 1199]]) {
    const pixel = png.pixel(x, y);
    if (!pixel || pixel.slice(0, 3).some((value, index) => value !== expected[index])) fail(`poster PNG lower background mismatch at ${x},${y}.`);
  }
  results.push({ mode: "poster", bytes: buffer.length, width: png.width, height: png.height });
}
if (args["icon-svg"]) results.push(await verifySvg(path.resolve(args["icon-svg"]), "icon"));
if (args["source-svg"]) results.push(await verifySvg(path.resolve(args["source-svg"]), "source"));
console.log(JSON.stringify({ ok: true, results }));
