import Mousetrap from 'mousetrap';
import browser from 'webextension-polyfill';
import { sendMessage } from '@/utils/message';

Mousetrap.prototype.stopCallback = function () {
  return false;
};

function turiumCustomEventListener(findWorkflow) {
  function customEventListener({ detail }) {
    if (!detail || (!detail.id && !detail.publicId)) return;

    const workflowId = detail.id || detail.publicId;
    const workflow = findWorkflow(workflowId, Boolean(detail.publicId));

    if (!workflow) return;

    workflow.options = {
      data: detail.data || {},
    };
    sendMessage('workflow:execute', workflow, 'background');
  }

  window.addEventListener('__turiumExecuteWorkflow', customEventListener);
  window.addEventListener('turium:execute-workflow', customEventListener);
}
function workflowShortcutsListener(findWorkflow, shortcutsObj) {
  const shortcuts = Object.entries(shortcutsObj);

  if (shortcuts.length === 0) return;

  const keyboardShortcuts = shortcuts.reduce((acc, [id, value]) => {
    let workflowId = id;
    if (id.startsWith('trigger')) {
      const { 1: triggerWorkflowId } = id.split(':');
      workflowId = triggerWorkflowId;
    }

    const workflow = findWorkflow(workflowId);
    if (!workflow) return acc;

    (acc[value] = acc[value] || []).push({
      id,
      workflow,
      activeInInput: workflow.trigger?.activeInInput || false,
    });

    return acc;
  }, {});

  Mousetrap.bind(Object.keys(keyboardShortcuts), ({ target }, command) => {
    const isInputElement =
      ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName) ||
      target?.contentEditable === 'true';

    keyboardShortcuts[command].forEach((item) => {
      if (!item.activeInInput && isInputElement) return;

      sendMessage('workflow:execute', item.workflow, 'background');
    });

    return true;
  });
}
async function getWorkflows() {
  const {
    workflows: localWorkflows,
    workflowHosts,
    teamWorkflows,
  } = await browser.storage.local.get([
    'workflows',
    'workflowHosts',
    'teamWorkflows',
  ]);

  return [
    ...Object.values(workflowHosts || {}),
    ...Object.values(localWorkflows || {}),
    ...Object.values(Object.values(teamWorkflows || {})[0] || {}),
  ];
}

export default async function () {
  try {
    const storage = await browser.storage.local.get('shortcuts');
    let workflows = await getWorkflows();

    const findWorkflow = (id, publicId = false) => {
      const workflow = workflows.find((item) => {
        if (publicId) {
          return item.settings.publicId === id;
        }

        return item.id === id;
      });

      return workflow;
    };

    browser.storage.onChanged.addListener(({ turiumShortcut, shortcuts }) => {
      if (turiumShortcut) {
        if (
          Array.isArray(turiumShortcut.newValue) &&
          turiumShortcut.newValue.length < 1
        ) {
          window._turiumShortcuts = [];
        } else {
          const turiumShortcutArr = turiumShortcut.newValue.split('+');

          window._turiumShortcuts = turiumShortcutArr;
        }
      }
      if (shortcuts) {
        Mousetrap.reset();
        getWorkflows().then((updatedWorkflows) => {
          workflows = updatedWorkflows;
          workflowShortcutsListener(findWorkflow, shortcuts.newValue || {});
        });
      }
    });

    turiumCustomEventListener(findWorkflow);
    workflowShortcutsListener(findWorkflow, storage.shortcuts || {});
  } catch (error) {
    console.error(error);
  }
}
