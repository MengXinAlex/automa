import browser from 'webextension-polyfill';
import initApp from './main';
import injectAppStyles from '../injectAppStyles';

function pageLoaded() {
  return new Promise((resolve) => {
    const checkDocState = () => {
      if (document.readyState === 'loading') {
        setTimeout(checkDocState, 1000);
        return;
      }

      resolve();
    };

    checkDocState();
  });
}

export default async function () {
  try {
    const isMainFrame = window.self === window.top;
    if (!isMainFrame) return;

    const isInvalidURL = /.(json|xml)$/.test(window.location.pathname);
    if (isInvalidURL) return;

    const { turiumShortcut } = await browser.storage.local.get(
      'turiumShortcut'
    );
    if (Array.isArray(turiumShortcut) && turiumShortcut.length === 0) return;

    await pageLoaded();

    const instanceExist = document.querySelector('turium-palette');
    if (instanceExist) return;

    const element = document.createElement('div');
    element.attachShadow({ mode: 'open' });
    element.id = 'turium-palette';

    await injectAppStyles(element.shadowRoot);
    initApp(element);

    document.body.appendChild(element);
  } catch (error) {
    console.error(error);
  }
}
