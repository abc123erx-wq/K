// ═══════════════════════════════════════════════════════════════
//  OPTIONAL ENGINES — carregamento em tempo de execução
//
//  Os motores externos (PixiJS, Phaser, PlayCanvas, Rapier) são
//  **opcionais** e **carregados sob demanda**.
//
//  Por que não usamos `import("pixi.js")` direto?
//
//    · O Vite resolve o import em tempo de build e inclui o pacote
//      no bundle. Com o plugin de "single file" isso inflaria o
//      HTML de ~1 MB para ~9 MB.
//    · Aqui a URL é resolvida em **tempo de execução**, o que
//      mantém o pacote fora do bundle principal.
//
//  Como funciona:
//
//    1. O servidor de desenvolvimento/deploy serve os pacotes a
//       partir de `public/engines/` (ou de um CDN, configurado por
//       `VITE_ENGINE_CDN`).
//    2. O `importScripts`/import dinâmico com a URL absoluta
//       carrega o módulo sob demanda.
//    3. Se o pacote não estiver disponível, a promise rejeita e o
//       jogo segue normalmente no renderizador original.
//
//  Nenhuma regra de jogo depende desses motores.
// ═══════════════════════════════════════════════════════════════

/** Base URL where the optional engine bundles live. */
function engineBaseUrl(): string {
  try {
    const env = (import.meta as any).env;
    const cdn = env?.VITE_ENGINE_CDN;
    if (typeof cdn === "string" && cdn.trim()) return cdn.trim().replace(/\/$/, "");
  } catch { /* ignore */ }
  return "/engines";
}

/** Cached load attempts, so a package is fetched at most once. */
const loadCache = new Map<string, Promise<any>>();

/**
 * Load an optional engine module by name.
 *
 * @param name  "pixi" | "phaser" | "playcanvas" | "rapier"
 * @returns the module namespace, or throws when unavailable
 */
export function loadOptionalEngine(name: string): Promise<any> {
  const cached = loadCache.get(name);
  if (cached) return cached;

  const promise = (async () => {
    const base = engineBaseUrl();
    switch (name) {
      case "pixi": {
        const mod = await import(/* @vite-ignore */ `${base}/pixi.mjs`);
        return mod.default ?? mod;
      }
      case "phaser": {
        const mod = await import(/* @vite-ignore */ `${base}/phaser.mjs`);
        return mod.default ?? mod;
      }
      case "playcanvas": {
        const mod = await import(/* @vite-ignore */ `${base}/playcanvas.mjs`);
        return mod.default ?? mod;
      }
      case "rapier": {
        const mod = await import(/* @vite-ignore */ `${base}/rapier2d.mjs`);
        return mod.default ?? mod;
      }
      default:
        throw new Error(`Motor desconhecido: ${name}`);
    }
  })();

  // Keep the rejection cached too, so we do not retry endlessly.
  loadCache.set(name, promise);
  return promise;
}

/** True when an engine has already been loaded successfully. */
export function isEngineLoaded(name: string): boolean {
  const entry = loadCache.get(name);
  return !!entry;
}

/** Forget every cached engine (used by tests). */
export function resetEngineCache(): void {
  loadCache.clear();
}
