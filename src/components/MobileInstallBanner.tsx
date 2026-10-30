// ============================================================
// MOBILE INSTALL BANNER — PWA install prompt + iOS instructions
// Shows only on mobile devices, first session
// ============================================================

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export default function MobileInstallBanner() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed (PWA running)
    const standalone = window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    // Check iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(iOS);

    // Check mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (!isMobile || standalone) return;

    // Check if user dismissed before
    if (localStorage.getItem("knox-banner-dismissed")) return;

    // Show after a delay
    const timer = setTimeout(() => setShowBanner(true), 5000);

    // PWA install prompt handler
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  if (isStandalone || !showBanner) return null;

  const install = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setShowBanner(false);
    }
  };

  const dismiss = () => {
    setShowBanner(false);
    localStorage.setItem("knox-banner-dismissed", "1");
  };

  return (
    <div className="fixed inset-x-2 bottom-2 z-[100] border-2 border-[#d96b3a] bg-[#0d0d0d]/98 p-3 shadow-2xl shadow-black backdrop-blur md:hidden">
      <div className="flex items-start gap-2">
        <span className="text-2xl">📱</span>
        <div className="flex-1">
          <p className="text-xs font-bold uppercase tracking-widest text-[#d96b3a]">Instale o Knox County</p>
          {isIOS ? (
            <p className="mt-1 text-[10px] text-zinc-400">
              Toque em <span className="text-[#d7c9a7]">⬆️ Compartilhar</span> e depois{" "}
              <span className="text-[#d7c9a7]">"Adicionar à Tela de Início"</span> para jogar em tela cheia!
            </p>
          ) : (
            <p className="mt-1 text-[10px] text-zinc-400">
              Adicione à tela inicial para jogar em tela cheia, offline, e com performance nativa.
            </p>
          )}
        </div>
        <button onClick={dismiss} className="border border-[#2a2a2a] px-2 py-1 text-[10px] text-zinc-500">✕</button>
      </div>
      {installPrompt && !isIOS && (
        <button
          onClick={install}
          className="mt-2 w-full bg-[#8a2f22] py-2 text-xs font-black uppercase tracking-widest text-zinc-100"
        >
          📲 Instalar Agora
        </button>
      )}
    </div>
  );
}
