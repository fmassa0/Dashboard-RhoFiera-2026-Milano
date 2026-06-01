import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const DISMISS_KEY = "plast26-install-dismissed";

export function InstallPrompt() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [iosTip, setIosTip] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  useEffect(() => {
    // Detect iOS Safari (no beforeinstallprompt) and suggest manual add to home
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // @ts-expect-error iOS Safari
      window.navigator.standalone === true;
    const wasDismissed = sessionStorage.getItem(DISMISS_KEY) === "1";
    if (wasDismissed) {
      setDismissed(true);
      return;
    }
    if (isIos && !isStandalone) setIosTip(true);
  }, []);

  if (dismissed) return null;
  if (!evt && !iosTip) return null;

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  const install = async () => {
    if (!evt) return;
    await evt.prompt();
    await evt.userChoice;
    dismiss();
  };

  return (
    <div
      role="dialog"
      aria-label="Aggiungi alla home"
      className="fixed left-1/2 -translate-x-1/2 z-40 max-w-sm w-[92%] rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg p-3 text-sm"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">Installa l&apos;app</div>
          <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
            {evt
              ? "Aggiungi PLAST26 Visite alla home: funziona offline durante la fiera."
              : "Su iOS: tocca Condividi e poi “Aggiungi a Home” per usarla offline."}
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Chiudi"
          className="min-h-tap min-w-tap text-neutral-400 hover:text-neutral-700"
        >
          ×
        </button>
      </div>
      {evt && (
        <button
          type="button"
          onClick={install}
          className="mt-2 w-full min-h-tap rounded-md bg-brand-500 text-white font-medium py-2"
        >
          Aggiungi alla home
        </button>
      )}
    </div>
  );
}
