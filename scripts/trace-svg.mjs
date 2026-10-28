import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { convertBuffer } from "../runtime/node_modules/@visioncortex/vtracer/index.js";
import { DOMParser, XMLSerializer } from "../runtime/node_modules/@xmldom/xmldom/lib/index.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const configPath = path.join(rootDir, "runtime", "vtracer-config.json");
const shapePath = path.join(rootDir, "assets", "ios-continuous-rounded-square.svg");

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (["--mode", "--input", "--output"].includes(arg)) {
      const value = argv[++i];
      if (!value) fail(`Missing value for ${arg}.`);
      args[arg.slice(2)] = value;
    } else {
      fail("Usage: node scripts/trace-svg.mjs --mode icon|source --input <png|jpg> --output <svg>");
    }
  }
  if (!args.mode || !["icon", "source"].includes(args.mode)) {
    fail("--mode is required and must be exactly icon or source.");
  }
  if (!args.input || !args.output) {
    fail("--input and --output are required.");
  }
  return args;
}

function parser() {
  const errors = [];
  const document = new DOMParser({
    onError: (level, message) => errors.push(`${level}: ${message}`),
  });
  return { document, errors };
}

function parseXml(xml, label) {
  const { document, errors } = parser();
  const parsed = document.parseFromString(xml, "image/svg+xml");
  if (errors.some((message) => message.startsWith("error:") || message.startsWith("fatal:"))) {
    fail(`${label} is not valid XML: ${errors.join("; ")}`);
  }
  if (!parsed?.documentElement || parsed.documentElement.nodeName.toLowerCase() !== "svg") {
    fail(`${label} does not have an SVG root.`);
  }
  return parsed;
}

function attr(node, name) {
  return node.getAttribute(name) || "";
}

function parseViewBox(root, label) {
  const viewBoxText = attr(root, "viewBox").trim();
  const viewBox = viewBoxText.split(/[\s,]+/).map(Number);
  if (viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
    return { x: viewBox[0], y: viewBox[1], width: viewBox[2], height: viewBox[3] };
  }
  const width = Number.parseFloat(attr(root, "width"));
  const height = Number.parseFloat(attr(root, "height"));
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return { x: 0, y: 0, width, height };
  }
  fail(`${label} has no usable viewBox or width/height.`);
}

function pngDimensions(buffer) {
  if (buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47 || buffer.readUInt32BE(4) !== 0x0d0a1a0a) {
    fail("icon mode requires a PNG input.");
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function rejectUnsafeElements(root, label) {
  const forbidden = new Set(["image", "filter", "lineargradient", "radialgradient", "foreignobject"]);
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (node.nodeType === 1) {
      const name = node.nodeName.toLowerCase();
      if (forbidden.has(name)) fail(`${label} contains forbidden <${name}>.`);
      if (node.hasAttribute("opacity") || node.hasAttribute("filter")) {
        fail(`${label} contains unsupported opacity/filter attributes.`);
      }
      for (let i = 0; i < node.childNodes.length; i += 1) stack.push(node.childNodes[i]);
    }
  }
}

function serializeChildren(root) {
  const serializer = new XMLSerializer();
  let output = "";
  for (let i = 0; i < root.childNodes.length; i += 1) {
    const child = root.childNodes[i];
    if (child.nodeType === 1 || child.nodeType === 3 || child.nodeType === 4) {
      output += serializer.serializeToString(child);
    }
  }
  return output;
}

function serializeDocument(document) {
  return new XMLSerializer().serializeToString(document);
}

async function readShapePath() {
  const shapeSvg = await fs.readFile(shapePath, "utf8");
  const doc = parseXml(shapeSvg, "continuous rounded-square asset");
  const paths = doc.documentElement.getElementsByTagName("path");
  if (paths.length !== 1 || !attr(paths[0], "d")) fail("Continuous rounded-square asset must contain exactly one path with d.");
  return attr(paths[0], "d");
}

function wrapIcon(raw, inputPath, shape, viewBox) {
  const body = serializeChildren(parseXml(raw, "VTracer output").documentElement);
  const title = escapeXml(path.basename(inputPath));
  const scaleX = 1024 / viewBox.width;
  const scaleY = 1024 / viewBox.height;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024" viewBox="0 0 1024 1024" role="img" aria-labelledby="title desc" shape-rendering="geometricPrecision" data-backend="dnr-flat-pic-v2-vtracer">
  <title id="title">${title}</title>
  <desc id="desc">DnR FlatPic v2 square SVG icon. layerDifference=32; palette omitted.</desc>
  <defs>
    <path id="icon-shape" d="${escapeXml(shape)}"/>
    <clipPath id="icon-clip" clipPathUnits="userSpaceOnUse"><use href="#icon-shape" xlink:href="#icon-shape"/></clipPath>
  </defs>
  <g clip-path="url(#icon-clip)">
    <g transform="scale(${scaleX} ${scaleY})">
${body}
    </g>
  </g>
</svg>
`;
}

const args = parseArgs(process.argv.slice(2));
const inputPath = path.resolve(args.input);
const outputPath = path.resolve(args.output);
const [input, configText] = await Promise.all([fs.readFile(inputPath), fs.readFile(configPath, "utf8")]);
const config = JSON.parse(configText);

if (args.mode === "icon") {
  const dimensions = pngDimensions(input);
  if (dimensions.width !== dimensions.height) {
    fail(`icon mode requires a square PNG; received ${dimensions.width}x${dimensions.height}.`);
  }
}

const raw = convertBuffer(input, config);
const rawDoc = parseXml(raw, "VTracer output");
const rawRoot = rawDoc.documentElement;
rejectUnsafeElements(rawRoot, "VTracer output");
const viewBox = parseViewBox(rawRoot, "VTracer output");
if (args.mode === "source" && !rawRoot.hasAttribute("viewBox")) {
  rawRoot.setAttribute("viewBox", `0 0 ${viewBox.width} ${viewBox.height}`);
}
const result = args.mode === "source" ? serializeDocument(rawDoc) : wrapIcon(raw, inputPath, await readShapePath(), viewBox);
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, result, "utf8");
console.log(JSON.stringify({ mode: args.mode, input: inputPath, output: outputPath, bytes: Buffer.byteLength(result), viewBox }));
