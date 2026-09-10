const fs = require("fs");
for (const pkg of ["starter-kit", "extension-link", "extension-placeholder", "extension-task-list", "extension-task-item", "extension-underline"]) {
  const p = `./node_modules/@tiptap/${pkg}/dist/index.js`;
  if (!fs.existsSync(p)) { console.log(pkg, "MISSING", p); continue; }
  const s = fs.readFileSync(p, "utf8");
  const names = [...s.matchAll(/name: ["']([a-z_0-9]+)["']/g)].map((m) => m[1]);
  console.log(pkg, "->", [...new Set(names)].join(", "));
}