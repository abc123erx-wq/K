#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  BUILD ENGINES — prepara os bundles opcionais em public/engines/
//
//  Os motores externos são carregados em tempo de execução a partir
//  de `public/engines/`. Este script copia/empacota cada motor
//  num módulo ESM autonomous, pronto para ser importado via
//  `import("/engines/pixi.mjs")`.
//
//  Ele é idempotente: rodar de novo apenas atualiza os arquivos.
//
//  Uso:  node scripts/build-engines.mjs
// ═══════════════════════════════════════════════════════════════

import { createRequire } from "node:module";
import { mkdir, writeFile, rm, cp, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "public", "engines");
const require = createRequire(import.meta.url);

const ENGINES = [
  {
    name: "pixi",
    entry: "pixi.js",
    file: "pixi.mjs",
    description: "PixiJS — renderer 2D acelerado (WebGL/WebGPU)",
  },
  {
    name: "phaser",
    entry: "phaser",
    file: "phaser.mjs",
    description: "Phaser — framework de jogos 2D",
  },
  {
    name: "playcanvas",
    entry: "playcanvas",
    file: "playcanvas.mjs",
    description: "PlayCanvas — runtime 3D (WebGL2/WebGPU)",
  },
  {
    name: "rapier",
    entry: "@dimforge/rapier2d-compat",
    file: "rapier2d.mjs",
    description: "Rapier — física 2D em WebAssembly",
  },
];

async function main() {
  await mkdir(OUT, { recursive: true });

  for (const engine of ENGINES) {
    const label = engine.description;
    try {
      // Some packages declare an "exports" map that hides package.json,
      // so we resolve the directory directly instead of through require.
      const pkgDir = path.join(ROOT, "node_modules", ...engine.entry.split("/"));
      if (!existsSync(pkgDir)) throw new Error("pacote não instalado");
      const pkg = JSON.parse(await (await import("node:fs/promises")).readFile(
        path.join(pkgDir, "package.json"),
        "utf8",
      ));

      // Many of these packages ship a pre-bundled browser build.
      const candidates = [
        path.join(pkgDir, "dist", "pixi.mjs"),
        path.join(pkgDir, "dist", "pixi.min.mjs"),
        path.join(pkgDir, "dist", "phaser.esm.js"),
        path.join(pkgDir, "dist", "phaser.esm.js"),
        path.join(pkgDir, "build", "playcanvas.mjs"),
        path.join(pkgDir, "build", "playcanvas.min.mjs"),
        path.join(pkgDir, "dist", "rapier.mjs"),
      ];

      let source = null;
      for (const candidate of candidates) {
        if (existsSync(candidate)) {
          source = candidate;
          break;
        }
      }

      if (!source) {
        // Fall back to the package "module"/"main" entry.
        const entryField = pkg.module || pkg.browser || pkg.main;
        if (entryField) {
          const candidate = path.join(pkgDir, entryField);
          if (existsSync(candidate)) source = candidate;
        }
      }

      if (!source) {
        console.warn(`  ⚠ ${engine.name}: nenhum bundle encontrado — pulando.`);
        continue;
      }

      await cp(source, path.join(OUT, engine.file));
      const { size } = await stat(path.join(OUT, engine.file));
      console.log(`  ✔ ${engine.name.padEnd(11)} → public/engines/${engine.file}  (${(size / 1024).toFixed(0)} kB)`);
      console.log(`      ${label}`);
    } catch (err) {
      console.warn(`  ⚠ ${engine.name}: ${err.message}`);
    }
  }

  // A small README explaining what this folder is.
  await writeFile(
    path.join(OUT, "README.md"),
    [
      "# Motores opcionais",
      "",
      "Esta pasta contém os bundles dos motores de renderização opcionais:",
      "",
      "- `pixi.mjs` — PixiJS (sprites/partículas acelerados, WebGL/WebGPU)",
      "- `phaser.mjs` — Phaser (cenas 2D e UI)",
      "- `playcanvas.mjs` — PlayCanvas (visualizador 3D, WebGL2/WebGPU)",
      "- `rapier2d.mjs` — Rapier (física 2D em WebAssembly)",
      "",
      "Eles são carregados **sob demanda**, só quando a funcionalidade",
      "correspondente é aberta. O jogo funciona normalmente sem eles.",
      "",
      "Regerar com: `node scripts/build-engines.mjs`",
      "",
    ].join("\n"),
    "utf8",
  );

  console.log("\n  Motores opcionais prontos em public/engines/\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
