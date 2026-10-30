#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  BUILD DO PACOTE DE ENTREGA  (releases/*.zip)
//
//  Gera um .zip com o código-fonte, o servidor endurecido, os
//  motores opcionais, a documentação e a auditoria — sem nenhum
//  segredo (nada de .env, chaves ou senhas).
//
//  Uso: node scripts/build-release.mjs
// ═══════════════════════════════════════════════════════════════

import { readdirSync, statSync, existsSync, rmSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, "releases");
const OUT_FILE = join(OUT_DIR, "project-zomboid-web-clone.zip");

// ── O que entra no pacote ─────────────────────────────────────
const INCLUDE_FILES = [
  "README.md",
  "index.html",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vite.config.ts",
  "vitest.config.ts",
  ".env.example",
  ".gitignore",
  "DOCUMENTACAO_ATUALIZACAO.md",
  "AUDITORIA_SEGURANCA.md",
];

const INCLUDE_DIRS = ["src", "public", "server", "scripts", "tests"];

// ── O que NUNCA entra no pacote ────────────────────────────────
const EXCLUDE_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", "coverage",
  ".vite", ".cache", ".next", "__pycache__", "artifacts",
]);
const EXCLUDE_FILES = new Set([
  ".env", ".env.local", ".env.development", ".env.production",
  "package-lock.json.bak", "npm-debug.log",
]);

/**
 * Verifica se o conteúdo de um arquivo parece conter um segredo REAL.
 *
 * Os padrões exigem um valor longo e sem placeholder: textos como
 * `pdl_live_apikey_…`, `pdl_live_apikey_<REDIGIDO>` ou
 * `pdl_live_apikey_...` são documentação de ambiente e NÃO bloqueiam
 * o pacote.
 */
function looksLikeSecret(content) {
  const patterns = [
    // chaves Paddle: prefixo + 20+ caracteres sem pontuação
    /pdl_(live|test)_apikey_[A-Za-z0-9]{20,}/,
    // chaves genéricas de API
    /\bapikey_[A-Za-z0-9]{20,}/,
    /\bapi_key_[A-Za-z0-9]{20,}/,
    // Stripe / OpenAI / GitHub
    /\bsk_live_[A-Za-z0-9]{20,}/,
    /\bsk-[A-Za-z0-9]{32,}/,
    /\bghp_[A-Za-z0-9]{30,}/,
    /\bgithub_pat_[A-Za-z0-9_]{40,}/,
    /\bAKIA[0-9A-Z]{16}\b/,
    // chaves privadas PEM
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    // JWT completo (header.payload.signature)
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    // (senhas de admin com valor literal são verificadas abaixo,
    //  para poder ignorar fixtures de teste)
  ];
  if (patterns.some((re) => re.test(content))) return true;

  // Valores claramente de teste (fixtures) não são segredos.
  const TEST_VALUES = /^(codigo-de-teste|test|teste|exemplo|placeholder|changeme|senha-de-teste|abc123|123456|dummy|xxxxx)/i;
  const literal = /(?:ADMIN_ACCESS_CODE|ADMIN_PASSWORD|ADMIN_TOKEN)\s*[:=]\s*["']([^"'\s]{6,})["']/g;
  let m;
  while ((m = literal.exec(content)) !== null) {
    if (!TEST_VALUES.test(m[1])) return true;
  }
  return false;
}

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (EXCLUDE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, acc);
    } else {
      if (EXCLUDE_FILES.has(entry)) continue;
      acc.push(full);
    }
  }
  return acc;
}

// ── Monta a lista de arquivos ──────────────────────────────────
const files = [];

for (const f of INCLUDE_FILES) {
  const full = join(ROOT, f);
  if (existsSync(full)) files.push(full);
}

for (const d of INCLUDE_DIRS) {
  const full = join(ROOT, d);
  if (existsSync(full)) walk(full, files);
}

// ── Verificação de segredos ────────────────────────────────────
let blocked = 0;
for (const f of files) {
  if (/\.(png|jpg|jpeg|gif|webp|zip|mjs\.map)$/i.test(f)) continue;
  if (!/\.(ts|tsx|js|mjs|json|md|html|css|txt|example)$/i.test(f)) continue;
  let content;
  try {
    content = readFileSync(f, "utf-8");
  } catch {
    continue;
  }
  if (looksLikeSecret(content)) {
    console.error(`✗ SEGREDO DETECTADO — arquivo removido do pacote: ${relative(ROOT, f)}`);
    blocked++;
  }
}
if (blocked > 0) {
  console.error("✗ Empacotamento abortado por segurança.");
  process.exit(1);
}

// ── Gera o .zip ────────────────────────────────────────────────
mkdirSync(OUT_DIR, { recursive: true });
if (existsSync(OUT_FILE)) rmSync(OUT_FILE);

const listFile = join(OUT_DIR, ".filelist.txt");
writeFileSync(listFile, files.map((f) => relative(ROOT, f)).join("\n"));

execFileSync("zip", ["-q", "-X", "-@", OUT_FILE], {
  cwd: ROOT,
  input: readFileSync(listFile, "utf-8"),
  stdio: ["pipe", "inherit", "inherit"],
});
rmSync(listFile);

// ── Relatório ─────────────────────────────────────────────────
const size = statSync(OUT_FILE).size;
const hash = createHash("sha256").update(readFileSync(OUT_FILE)).digest("hex");

console.log(`✓ ${relative(ROOT, OUT_FILE)}`);
console.log(`  arquivos: ${files.length}`);
console.log(`  tamanho:  ${(size / 1024 / 1024).toFixed(2)} MB`);
console.log(`  sha256:   ${hash}`);
