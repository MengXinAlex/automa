import browser from 'webextension-polyfill';
import { nanoid } from 'nanoid';
import cloneDeep from 'lodash.clonedeep';
import findSelector from '@/lib/findSelector';
import { sendMessage } from '@/utils/message';
import turium from '@business';
import { toCamelCase, isXPath } from '@/utils/helper';
import handleSelector, {
  queryElements,
  getDocumentCtx,
} from './handleSelector';
import blocksHandler from './blocksHandler';
import showExecutedBlock from './showExecutedBlock';
import shortcutListener from './services/shortcutListener';
import initCommandPalette from './commandPalette';
// import elementObserver from './elementObserver';
import { elementSelectorInstance } from './utils';

const isMainFrame = window.self === window.top;

function messageToFrame(frameElement, blockData) {
  return new Promise((resolve, reject) => {
    function onMessage({ data }) {
      if (data.type !== 'turium:block-execute-result') return;

      if (data.result?.$isError) {
        const error = new Error(data.result.message);
        error.data = data.result.data;

        reject(error);
      } else {
        resolve(data.result);
      }

      window.removeEventListener('message', onMessage);
    }
    window.addEventListener('message', onMessage);

    const messageId = `message:${nanoid(4)}`;
    browser.storage.local.set({ [messageId]: true }).then(() => {
      frameElement.contentWindow.postMessage(
        {
          messageId,
          type: 'turium:execute-block',
          blockData: { ...blockData, frameSelector: '' },
        },
        '*'
      );
    });
  });
}
async function executeBlock(data) {
  const removeExecutedBlock = showExecutedBlock(data, data.executedBlockOnWeb);
  if (data.data?.selector?.includes('|>')) {
    const selectorsArr = data.data.selector.split('|>');
    const selector = selectorsArr.pop();
    const frameSelector = selectorsArr.join('|>');

    const framElSelector = selectorsArr.pop();

    let findBy = data?.data?.findBy;
    if (!findBy) {
      findBy = isXPath(frameSelector) ? 'xpath' : 'cssSelector';
    }

    const documentCtx = getDocumentCtx(selectorsArr.join('|>'));
    const frameElement = await queryElements(
      {
        findBy,
        multiple: false,
        waitForSelector: 5000,
        selector: framElSelector,
      },
      documentCtx
    );
    const frameError = (message) => {
      const error = new Error(message);
      error.data = { selector: frameSelector };

      return error;
    };

    if (!frameElement) throw frameError('iframe-not-found');

    const isFrameEelement = ['IFRAME', 'FRAME'].includes(frameElement.tagName);
    if (!isFrameEelement) throw frameError('not-iframe');

    const { x, y } = frameElement.getBoundingClientRect();
    const iframeDetails = { x, y };

    if (isMainFrame) {
      iframeDetails.windowWidth = window.innerWidth;
      iframeDetails.windowHeight = window.innerHeight;
    }

    data.data.selector = selector;
    data.data.$frameRect = iframeDetails;
    data.data.$frameSelector = frameSelector;

    if (frameElement.contentDocument) {
      data.frameSelector = frameSelector;
    } else {
      const result = await messageToFrame(frameElement, data);
      return result;
    }
  }
  const handlers = blocksHandler();
  const handler = handlers[toCamelCase(data.name || data.label)];
  if (handler) {
    const result = await handler(data, { handleSelector });
    removeExecutedBlock();

    return result;
  }

  const error = new Error(`"${data.label}" doesn't have a handler`);
  console.error(error);

  throw error;
}
async function messageListener({ data, source }) {
  try {
    if (data.type === 'turium:get-frame' && isMainFrame) {
      let frameRect = { x: 0, y: 0 };

      document.querySelectorAll('iframe').forEach((iframe) => {
        if (iframe.contentWindow !== source) return;

        frameRect = iframe.getBoundingClientRect();
      });

      source.postMessage(
        {
          frameRect,
          type: 'turium:the-frame-rect',
        },
        '*'
      );

      return;
    }

    if (data.type === 'turium:execute-block') {
      const messageToken = await browser.storage.local.get(data.messageId);
      if (!data.messageId || !messageToken[data.messageId]) {
        window.top.postMessage(
          {
            result: {
              $isError: true,
              message: 'Block id is empty',
              data: {},
            },
            type: 'turium:block-execute-result',
          },
          '*'
        );
        return;
      }

      await browser.storage.local.remove(data.messageId);

      executeBlock(data.blockData)
        .then((result) => {
          window.top.postMessage(
            {
              result,
              type: 'turium:block-execute-result',
            },
            '*'
          );
        })
        .catch((error) => {
          console.error(error);
          window.top.postMessage(
            {
              result: {
                $isError: true,
                message: error.message,
                data: error.data || {},
              },
              type: 'turium:block-execute-result',
            },
            '*'
          );
        });
    }
  } catch (error) {
    console.error(error);
  }
}

(() => {
  if (window.isTuriumInjected) return;

  initCommandPalette();

  let contextElement = null;
  let $ctxLink = '';
  let $ctxMediaUrl = '';
  let $ctxTextSelection = '';

  window.isTuriumInjected = true;
  window.addEventListener('message', messageListener);
  window.addEventListener(
    'contextmenu',
    ({ target }) => {
      contextElement = target;
      $ctxTextSelection = window.getSelection().toString();

      const tag = target.tagName;
      if (tag === 'A') {
        $ctxLink = target.href;
      } else {
        const closestUrl = target.closest('a');
        if (closestUrl) $ctxLink = closestUrl.href;
      }

      const getMediaSrc = (element) => {
        let mediaSrc = element.src || '';

        if (!mediaSrc.src) {
          const sourceEl = element.querySelector('source');
          if (sourceEl) mediaSrc = sourceEl.src;
        }

        return mediaSrc;
      };

      const mediaTags = ['AUDIO', 'VIDEO', 'IMG'];
      if (mediaTags.includes(tag)) {
        $ctxMediaUrl = getMediaSrc(target);
      } else {
        const closestMedia = target.closest('audio,video,img');
        if (closestMedia) $ctxMediaUrl = getMediaSrc(closestMedia);
      }
    },
    true
  );

  window.isTuriumInjected = true;
  window.addEventListener('message', messageListener);
  window.addEventListener('contextmenu', ({ target }) => {
    contextElement = target;
    $ctxTextSelection = window.getSelection().toString();
  });

  if (isMainFrame) {
    shortcutListener();
    // window.addEventListener('load', elementObserver);
  }

  turium('content');

  browser.runtime.onMessage.addListener(async (data) => {
    const asyncExecuteBlock = async (block) => {
      try {
        const res = await executeBlock(block);
        return res;
      } catch (error) {
        console.error(error);
        const elNotFound = error.message === 'element-not-found';
        const isLoopItem = data.data?.selector?.includes('turium-loop');

        if (!elNotFound || !isLoopItem) return Promise.reject(error);

        const findLoopEl = data.loopEls.find(({ url }) =>
          window.location.href.includes(url)
        );

        const blockData = { ...data.data, ...findLoopEl, multiple: true };
        const loopBlock = {
          ...data,
          onlyGenerate: true,
          data: blockData,
        };

        await blocksHandler().loopData(loopBlock);
        return executeBlock(block);
      }
    };

    if (data.isBlock) {
      const res = await asyncExecuteBlock(data);
      return res;
    }

    switch (data.type) {
      case 'input-workflow-params':
        window.initPaletteParams?.(data.data);
        return Boolean(window.initPaletteParams);
      case 'content-script-exists':
        return true;
      case 'turium-element-selector': {
        return elementSelectorInstance();
      }
      case 'context-element': {
        let $ctxElSelector = '';

        if (contextElement) {
          $ctxElSelector = findSelector(contextElement);
          contextElement = null;
        }
        if (!$ctxTextSelection) {
          $ctxTextSelection = window.getSelection().toString();
        }

        const cloneContextData = cloneDeep({
          $ctxLink,
          $ctxMediaUrl,
          $ctxElSelector,
          $ctxTextSelection,
        });

        $ctxLink = '';
        $ctxMediaUrl = '';
        $ctxElSelector = '';
        $ctxTextSelection = '';

        return cloneContextData;
      }
      default:
        return null;
    }
  });
})();

window.addEventListener('__turium-fetch__', (event) => {
  const { id, resource, type } = event.detail;
  const sendResponse = (payload) => {
    window.dispatchEvent(
      new CustomEvent(`__turium-fetch-response-${id}__`, {
        detail: { id, ...payload },
      })
    );
  };

  sendMessage('fetch', { type, resource }, 'background')
    .then((result) => {
      sendResponse({ isError: false, result });
    })
    .catch((error) => {
      sendResponse({ isError: true, result: error.message });
    });
});

window.addEventListener('DOMContentLoaded', async () => {
  const link = window.location.pathname;
  const isTuriumWorkflow = /.+\.turium\.json$/.test(link);
  if (!isTuriumWorkflow) return;

  const accept = window.confirm(
    'Do you want to add this workflow into Turium?'
  );
  if (!accept) return;
  const workflow = JSON.parse(document.documentElement.innerText);

  const { workflows: workflowsStorage } = await browser.storage.local.get(
    'workflows'
  );

  const workflowId = nanoid();
  const workflowData = {
    ...workflow,
    id: workflowId,
    dataColumns: [],
    createdAt: Date.now(),
    table: workflow.table || workflow.dataColumns,
  };

  if (Array.isArray(workflowsStorage)) {
    workflowsStorage.push(workflowData);
  } else {
    workflowsStorage[workflowId] = workflowData;
  }

  await browser.storage.local.set({ workflows: workflowsStorage });

  alert('Workflow installed');
});
