import { mkdir, copyFile, chmod } from "node:fs/promises";
const root = new URL("./", import.meta.url);
await mkdir(new URL("dist/", root), { recursive: true });
await copyFile(new URL("index.js", root), new URL("dist/index.js", root));
await chmod(new URL("dist/index.js", root), 0o755);
await copyFile(new URL("../README.md", root), new URL("README.md", root));
await copyFile(new URL("../LICENSE", root), new URL("LICENSE", root));
