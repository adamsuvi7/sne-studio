// Salin REFERENCE_TEMPLATES (24 template tipografi Studio Foto) ke video-templates-data.js untuk Editor Video.
// Hanya lapisan teks yang diambil (tanpa foto Base64). Jalankan ulang bila template di index.html berubah:
//   node tools/gen-video-templates.mjs
import fs from "fs";
import vm from "vm";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const start = html.indexOf("const REFERENCE_TEMPLATES = [");
if (start < 0) throw new Error("REFERENCE_TEMPLATES tidak ditemukan di index.html");
// cari ']' penutup array dengan menghitung kurung (string dilewati)
let i = html.indexOf("[", start), depth = 0, q = null;
for (; i < html.length; i++) {
  const ch = html[i];
  if (q) { if (ch === "\\") i++; else if (ch === q) q = null; continue; }
  if (ch === '"' || ch === "'" || ch === "`") q = ch;
  else if (ch === "[" || ch === "{") depth++;
  else if (ch === "]" || ch === "}") { depth--; if (depth === 0) break; }
}
const src = html.slice(html.indexOf("[", start), i + 1);
const stub = new Proxy({}, { get: () => null });
const list = vm.runInNewContext("(" + src + ")", { REF_THUMBS: stub, CLEAN_PHOTOS: stub, SAMPLE_PHOTOS: stub });
const KEEP = ["text", "x", "y", "fontFamily", "fontSize", "fontWeight", "fontStyle", "underline", "uppercase", "color", "opacity", "align", "letterSpacing", "lineHeight", "rotation", "curve", "strokeWidth", "strokeColor", "shadowBlur", "shadowColor", "decor", "bgPill", "bgPillColor", "bgPillStyle", "bgPillPad", "bgPillRadius", "extrudeDepth", "extrudeColor", "gradientEnabled", "color2", "gradientDir", "role"];
const out = list.map((t) => ({
  id: t.id, name: t.name, sub: t.sub, cat: "Studio Foto",
  layers: t.layers.map((l) => Object.fromEntries(KEEP.filter((k) => l[k] !== undefined).map((k) => [k, l[k]])))
}));
const body = `// DIBUAT OTOMATIS oleh tools/gen-video-templates.mjs dari REFERENCE_TEMPLATES di index.html — jangan diedit manual.\nwindow.SNE_PHOTO_TEMPLATES = ${JSON.stringify(out)};\n`;
fs.writeFileSync(path.join(root, "video-templates-data.js"), body);
console.log(`${out.length} template, ${out.reduce((a, t) => a + t.layers.length, 0)} lapisan -> video-templates-data.js (${(body.length / 1024).toFixed(1)} KB)`);
