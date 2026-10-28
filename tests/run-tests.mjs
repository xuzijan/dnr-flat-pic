import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, "..");
const outputDir = path.join(testDir, "output");
const fixtureDir = path.join(testDir, ".tmp", "fixtures");
const node = process.execPath;

const skillText = await fs.readFile(path.join(rootDir, "SKILL.md"), "utf8");
if (!/^name: dnr-flat-pic$/m.test(skillText)) throw new Error("release skill name is missing or not exact.");
if (!skillText.includes("生成海报 / 生成 SVG 图标 / 导出当前插画 SVG（原比例）/ 都要")) throw new Error("derived action router is missing.");
if (skillText.includes("layerDifference") || skillText.includes("poster-layout.json")) {
  throw new Error("core SKILL.md contains derived implementation details.");
}

async function run(script, args) {
  const result = await execFileAsync(node, [path.join(rootDir, script), ...args], { cwd: rootDir, maxBuffer: 16 * 1024 * 1024 });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result;
}

await fs.mkdir(outputDir, { recursive: true });
await run("tests/create-fixtures.mjs", []);
await run("tests/test-resvg-init.mjs", []);
await run("tests/test-raster.mjs", []);
await run("scripts/trace-svg.mjs", ["--mode", "source", "--input", path.join(fixtureDir, "photo.png"), "--output", path.join(outputDir, "fixture-flat.svg")]);
await run("scripts/trace-svg.mjs", ["--mode", "icon", "--input", path.join(fixtureDir, "square-icon-source.png"), "--output", path.join(outputDir, "fixture-icon.svg")]);
  await run("scripts/render-poster.mjs", ["--photo", path.join(rootDir, "docs", "showcase", "02-sunset-bridge.jpg"), "--square-source-png", path.join(fixtureDir, "square-icon-source.png"), "--output", path.join(outputDir, "fixture-poster.png")]);
await run("scripts/verify-outputs.mjs", ["--poster", path.join(outputDir, "fixture-poster.png"), "--icon-svg", path.join(outputDir, "fixture-icon.svg"), "--source-svg", path.join(outputDir, "fixture-flat.svg")]);

let rejected = false;
try {
  await run("scripts/trace-svg.mjs", ["--mode", "icon", "--input", path.join(fixtureDir, "photo.png"), "--output", path.join(outputDir, "should-not-exist.svg")]);
} catch (error) {
  rejected = /square PNG/i.test(String(error.stderr || error.stdout || error));
}
if (!rejected) throw new Error("icon mode did not reject the non-square fixture.");
console.log("DnR FlatPic v2.0 derived-output tests passed");
