import { nanoid } from 'nanoid/non-secure';

export default function (data) {
  let timeout;
  const instanceId = nanoid();
  const scriptId = `script${data.id}`;
  const propertyName = `turium${data.id}`;

  const isScriptExists = document.querySelector(`#${scriptId}`);
  if (isScriptExists) {
    window.top.postMessage(
      {
        id: data.id,
        type: 'sandbox',
        result: {
          columns: {},
          variables: {},
        },
      },
      '*'
    );

    return;
  }

  const preloadScripts = data.preloadScripts.map((item) => {
    const scriptEl = document.createElement('script');
    scriptEl.textContent = item.script;

    (document.body || document.documentElement).appendChild(scriptEl);

    return scriptEl;
  });

  if (!data.blockData.code.includes('turiumNextBlock')) {
    data.blockData.code += `\n turiumNextBlock()`;
  }

  const script = document.createElement('script');
  script.id = scriptId;
  script.textContent = `
    (() => {
      function turiumRefData(keyword, path = '') {
        if (!keyword) return null;
        if (!path) return ${propertyName}.refData[keyword];

        return window.$getNestedProperties(${propertyName}.refData, keyword + '.' + path);
      }
      function turiumSetVariable(name, value) {
        const variables = ${propertyName}.refData.variables;
        if (!variables) ${propertyName}.refData.variables = {}

        ${propertyName}.refData.variables[name] = value;
      }
      function turiumNextBlock(data = {}, insert = true) {
        ${propertyName}.nextBlock({ data, insert });
      }
      function turiumResetTimeout() {
        ${propertyName}.resetTimeout();
      }
      function turiumFetch(type, resource) {
        return ${propertyName}.fetch(type, resource);
      }

      try {
        ${data.blockData.code}
      } catch (error) {
        console.error(error);
        turiumNextBlock({ $error: true, message: error.message });
      }
    })();
  `;

  function cleanUp() {
    script.remove();
    preloadScripts.forEach((preloadScript) => {
      preloadScript.remove();
    });

    delete window[propertyName];
  }

  window[propertyName] = {
    refData: data.refData,
    nextBlock: (result) => {
      cleanUp();
      window.top.postMessage(
        {
          id: data.id,
          type: 'sandbox',
          result: {
            variables: data?.refData?.variables,
            columns: {
              data: result?.data,
              insert: result?.insert,
            },
          },
        },
        '*'
      );
    },
    resetTimeout: () => {
      clearTimeout(timeout);
      timeout = setTimeout(cleanUp, data.blockData.timeout);
    },
    fetch: (type, resource) => {
      return new Promise((resolve, reject) => {
        const types = ['json', 'text'];
        if (!type || !types.includes(type)) {
          reject(new Error('The "type" must be "text" or "json"'));
          return;
        }

        window.top.postMessage(
          {
            type: 'turium-fetch',
            data: { id: instanceId, type, resource },
          },
          '*'
        );

        const eventName = `turium-fetch-response-${instanceId}`;

        const eventListener = ({ detail }) => {
          window.removeEventListener(eventName, eventListener);

          if (detail.isError) {
            reject(new Error(detail.result));
          } else {
            resolve(detail.result);
          }
        };

        window.addEventListener(eventName, eventListener);
      });
    },
  };

  timeout = setTimeout(cleanUp, data.blockData.timeout);
  (document.body || document.documentElement).appendChild(script);
}
