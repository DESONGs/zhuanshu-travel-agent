import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const requestedPlatform = process.argv[2];
const platforms = requestedPlatform ? [requestedPlatform] : ["wechat", "alipay"];
const contracts = {
  wechat: ["project.config.json", "app.json", "app.js", "app.wxss", "pages/index/index.json", "pages/index/index.js", "pages/index/index.wxml", "pages/index/index.wxss"],
  alipay: ["mini.project.json", "app.json", "app.js", "app.acss", "pages/index/index.json", "pages/index/index.js", "pages/index/index.axml", "pages/index/index.acss"],
};

for (const platform of platforms) {
  assert.ok(contracts[platform], `Unsupported mini-program platform: ${platform}`);
  const root = resolve(process.cwd(), "apps", "miniapp", platform);
  for (const file of contracts[platform]) await access(resolve(root, file));
  const projectFile = platform === "wechat" ? "project.config.json" : "mini.project.json";
  const appConfig = JSON.parse(await readFile(resolve(root, "app.json"), "utf8"));
  const projectConfig = JSON.parse(await readFile(resolve(root, projectFile), "utf8"));
  assert.deepEqual(appConfig.pages, ["pages/index/index"]);
  assert.equal(projectConfig.appid, "", "An AppID must be injected by the authorized release owner, never hard-coded as a demo ID.");
  await run(process.execPath, ["--check", resolve(root, "app.js")]);
  await run(process.execPath, ["--check", resolve(root, "pages/index/index.js")]);
  console.log(`${platform}: native project contract valid`);
}
