import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("..", import.meta.url);
const rootPath = fileURLToPath(root);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const index = read("index.html");
const manifest = JSON.parse(read("manifest.webmanifest"));
const serviceWorker = read("service-worker.js");
const readme = read("README.md");
const gitignore = read(".gitignore");
const style = read("style.css");
const script = read("script.js");

assert.match(index, /<title>3D 五子棋<\/title>/);
assert.match(index, /<script type="module" src="script\.js"><\/script>/);
assert.equal(manifest.name, "3D 五子棋");
assert.match(serviceWorker, /game-rules\.js/);
assert.match(serviceWorker, /gomoku-pwa-v8/);
assert.match(gitignore, /\.claude\//);
assert.match(readme, /npm run verify/);
assert.match(style, /\.intersection\.last-move::after/);
assert.match(style, /body\[data-skin="cat"\] \.stone::before/);
assert.match(style, /--board-thickness/);
assert.match(style, /--stone-size/);
assert.doesNotMatch(style, /\.stone[\s\S]*?transform:\s*translateZ/);
assert.match(style, /width:\s*100vw/);
assert.match(style, /perspective:\s*none/);
assert.match(style, /\.stone[\s\S]*?filter:\s*none/);
assert.match(style, /\.stone[\s\S]*?box-shadow:\s*none/);
assert.doesNotMatch(style, /drop-shadow/);
assert.match(script, /function refreshZoomLimit/);
assert.match(script, /mobile \? 1\.00 : 1\.45/);
assert.equal(existsSync(join(rootPath, "docs", "screenshot.png")), true);

console.log("static tests passed");
