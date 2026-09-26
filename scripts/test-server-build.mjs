import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import ts from "typescript";

// Vercel emits .js files. Exercise those files, not Node's TS source loader.
const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile).config;
const options = ts.convertCompilerOptionsFromJson(
  config.compilerOptions,
  ".",
).options;
mkdirSync("work", { recursive: true });
const root = mkdtempSync(resolve("work", "server-build-"));
const queue = ["api/index.ts"],
  visited = new Set();
for (const file of queue) {
  if (visited.has(file)) continue;
  visited.add(file);
  const output = resolve(root, file.replace(/\.ts$/, ".js"));
  mkdirSync(dirname(output), { recursive: true });
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: { ...options, noEmit: false },
  }).outputText;
  writeFileSync(output, compiled);
  for (const match of compiled.matchAll(
    /(?:from\s*|import\s*\()\s*["'](\.[^"']+\.js)["']/g,
  ))
    queue.push(
      relative(
        process.cwd(),
        resolve(dirname(file), match[1].replace(/\.js$/, ".ts")),
      ),
    );
}
const { default: handler } = await import(
  pathToFileURL(resolve(root, "api/index.js"))
);
const http = createServer(handler);
await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve));
try {
  const response = await fetch(
    `http://127.0.0.1:${http.address().port}/api/status`,
  );
  assert.equal(response.status, 200);
  assert.equal(typeof (await response.json()).configured, "boolean");
  console.log("PASS compiled server imports and HTTP status endpoint");
} finally {
  await new Promise((resolve) => http.close(resolve));
}
