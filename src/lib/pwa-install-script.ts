/** Event dispatched on `window` whenever install availability changes. */
export const INSTALL_EVENT = "qc-install-change";

/**
 * Inlined in the root layout <head> so `beforeinstallprompt` is captured even
 * when it fires before React hydrates (see src/lib/pwa-install.ts).
 */
export const installCaptureScript = `(function(){function c(){window.dispatchEvent(new Event('${INSTALL_EVENT}'))}window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__qcInstallPrompt=e;c()});window.addEventListener('appinstalled',function(){window.__qcInstallPrompt=null;window.__qcInstalled=true;c()})})();`;
