// ═══════════════════════════════════════════════════════════════
//  GODOT (HTML5) INTEGRATION — carrega uma build exportada
//
//  O Godot 4 exporta para a web como WebGL2 + WebAssembly. Esta
//  módulo permite que o jogo Day of the Undead **abra uma build
//  do Godot** (por exemplo um minijogo, um tutorial ou uma cena
//  cinemática) dentro de um canvas isolado.
//
//  Decisões de projeto:
//
//    · A build do Godot fica numa pasta própria (`public/godot/`)
//      e é carregada **sob demanda** — o jogador só paga o
//      download quando realmente abre esse conteúdo.
//    · A integração é **totalmente opcional**: se a build não
//      existir, o botão é ocultado e nada acontece.
//    · O canvas do Godot roda em um iframe/canvas próprio, com
//      sandbox e `allow` restrito — o conteúdo do Godot nunca
//      ganha acesso ao DOM do jogo.
//
//  O jogo principal **não** é reescrito em Godot: esta é uma
//  camada de hospedagem, não uma migração.
// ═══════════════════════════════════════════════════════════════

export interface GodotBuildInfo {
  /** Whether a Godot build is present in the deployment. */
  available: boolean;
  /** Path of the exported HTML entry point. */
  entryPoint: string;
  /** Engine version the build was made with (when declared). */
  version: string;
  /** Reason when unavailable. */
  reason: string;
}

export interface GodotInstance {
  /** The canvas the Godot engine is rendering into. */
  canvas: HTMLCanvasElement;
  /** The iframe hosting the Godot page (when the build uses one). */
  frame: HTMLIFrameElement | null;
  /** Stop the engine and release the resources. */
  destroy: () => void;
  /** Pause / resume the engine. */
  setPaused: (paused: boolean) => void;
}

const GODOT_BUILD_PATH = "/godot/index.html";
const GODOT_VERSION = "4.3";

/**
 * Probe whether a Godot build is deployed alongside the game.
 *
 * The check is a cheap `HEAD` request on the build manifest; it
 * never throws and never blocks the UI.
 */
export async function detectGodotBuild(): Promise<GodotBuildInfo> {
  const base = {
    available: false,
    entryPoint: GODOT_BUILD_PATH,
    version: GODOT_VERSION,
    reason: "",
  };

  try {
    const res = await fetch(`${GODOT_BUILD_PATH}/build.json`, {
      method: "GET",
      cache: "no-cache",
    });
    if (!res.ok) {
      return { ...base, reason: "Nenhum build do Godot disponível neste deploy." };
    }
    const manifest = await res.json();
    return {
      available: true,
      entryPoint: manifest.entryPoint ?? GODOT_BUILD_PATH,
      version: manifest.version ?? GODOT_VERSION,
      reason: "",
    };
  } catch {
    return { ...base, reason: "Nenhum build do Godot disponível neste deploy." };
  }
}

/**
 * Load a Godot build inside an isolated container.
 *
 * The Godot page runs inside an iframe with a restrictive sandbox:
 * it may run scripts, but it cannot reach the parent document, the
 * parent cookies or the parent's storage.
 */
export async function loadGodotBuild(
  container: HTMLElement,
  info: GodotBuildInfo,
  onError?: (message: string) => void,
): Promise<GodotInstance | null> {
  if (!info.available) {
    onError?.(info.reason || "Build do Godot indisponível.");
    return null;
  }

  const frame = document.createElement("iframe");
  frame.src = info.entryPoint;
  frame.title = "Conteúdo Godot";
  frame.setAttribute("sandbox", "allow-scripts allow-pointer-lock allow-same-origin");
  frame.setAttribute("allow", "gamepad; fullscreen; autoplay; cross-origin-isolated");
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.style.width = "100%";
  frame.style.height = "100%";
  frame.style.border = "0";
  frame.style.display = "block";
  frame.style.background = "#000";

  const canvas = document.createElement("canvas");
  canvas.style.display = "none";

  container.appendChild(frame);

  // The Godot engine asks the host page to resize its canvas.
  const resizeHandler = (event: MessageEvent) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if ((data as any).type === "godot-resize") {
      const width = Number((data as any).width);
      const height = Number((data as any).height);
      if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
        frame.style.width = `${width}px`;
        frame.style.height = `${height}px`;
      }
    }
  };
  window.addEventListener("message", resizeHandler);

  let destroyed = false;
  let paused = false;

  return {
    canvas,
    frame,
    setPaused(next: boolean) {
      paused = next;
      try {
        frame.contentWindow?.postMessage({ type: "godot-pause", paused }, "*");
      } catch { /* ignore */ }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      window.removeEventListener("message", resizeHandler);
      try { frame.contentWindow?.postMessage({ type: "godot-stop" }, "*"); } catch { /* ignore */ }
      frame.remove();
      canvas.remove();
    },
  };
}
