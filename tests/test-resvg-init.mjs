import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initWasm, Resvg } from "../runtime/node_modules/@resvg/resvg-wasm/index.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const wasmPath = path.resolve(testDir, "..", "runtime", "node_modules", "@resvg", "resvg-wasm", "index_bg.wasm");
const svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1\" height=\"1\"><rect width=\"1\" height=\"1\" fill=\"#000\"/></svg>";

let uninitializedFailed = false;
try {
  new Resvg(svg);
} catch (error) {
  uninitializedFailed = /not been initialized/i.test(String(error));
}
if (!uninitializedFailed) throw new Error("resvg must reject construction before initWasm.");

await initWasm(await fs.readFile(wasmPath));
const renderer = new Resvg(svg);
const rendered = renderer.render();
if (rendered.width !== 1 || rendered.height !== 1) throw new Error("resvg initialized but rendered dimensions are wrong.");
if (typeof rendered.free === "function") rendered.free();
if (typeof renderer.free === "function") renderer.free();

let duplicateFailed = false;
try {
  await initWasm(await fs.readFile(wasmPath));
} catch (error) {
  duplicateFailed = /already initialized/i.test(String(error));
}
if (!duplicateFailed) throw new Error("resvg must reject duplicate initWasm calls.");
console.log("resvg init contract passed");
