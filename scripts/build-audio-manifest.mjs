import { readdir, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(__dirname, "..");
const audioDir = path.join(siteRoot, "public", "audio");
const dataDir = path.join(siteRoot, "public", "data");
const outFile = path.join(dataDir, "audio-manifest.json");
const supported = new Set([".mp3", ".m4a", ".wav"]);

await mkdir(audioDir, { recursive: true });
await mkdir(dataDir, { recursive: true });
const files = await readdir(audioDir);
const manifest = {};
for (const file of files) {
  const ext = path.extname(file).toLowerCase();
  const id = path.basename(file, ext);
  if (!supported.has(ext)) continue;
  if (!/^(UX|PM)-\d{3}$|^AI-CROSS-\d{3}$/.test(id)) continue;
  manifest[id] = {
    src: `/audio/${file}`,
    format: ext.slice(1),
    file,
  };
}

await writeFile(outFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Indexed ${Object.keys(manifest).length} audio files.`);
