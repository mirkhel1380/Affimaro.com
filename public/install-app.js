(() => {
  'use strict';
  const button = document.querySelector('[data-install-button]');
  const status = document.querySelector('[data-install-status]');
  const displayMode = window.matchMedia('(display-mode: standalone)');
  let installed = displayMode.matches || navigator.standalone === true;
  let deferredPrompt = null;
  const message = text => { if (status) status.textContent = text; };
  const showInstalled = () => {
    installed = true;
    deferredPrompt = null;
    if (button) button.hidden = true;
    message('Affimaro is installed. Open it from your home screen or apps list.');
  };

  if (installed) showInstalled();
  window.addEventListener('appinstalled', showInstalled);
  displayMode.addEventListener?.('change', event => { if (event.matches) showInstalled(); });
  window.addEventListener('beforeinstallprompt', event => {
    if (!button || installed) return;
    event.preventDefault();
    deferredPrompt = event;
    button.hidden = false;
    button.disabled = false;
    message('Affimaro is ready to install on this device.');
  });
  button?.addEventListener('click', async () => {
    if (!deferredPrompt || installed) return;
    const prompt = deferredPrompt;
    deferredPrompt = null;
    button.disabled = true;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (!installed) message(choice.outcome === 'accepted'
        ? 'Follow your browser’s instructions to finish installing Affimaro.'
        : 'You can install later from your browser menu.');
    } catch {
      message('Use your browser menu to install Affimaro, or follow the steps below.');
    } finally {
      button.hidden = true;
    }
  });

  if (window.isSecureContext && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js', {scope: '/', updateViaCache: 'none'}).catch(() => {
      if (!installed) message('Open this page while connected, then try installing again. You can keep using Affimaro in your browser.');
    });
  }
})();
