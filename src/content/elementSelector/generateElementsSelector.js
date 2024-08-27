import findSelector from '@/lib/findSelector';
import { generateXPath } from '../utils';

export default function ({
  list,
  target,
  selectorType,
  frameElement,
  hoveredElements,
  selectorSettings,
}) {
  let selector = '';

  const selectorOptions = selectorSettings || {};
  const [selectedElement] = hoveredElements;
  const finderOptions = { ...selectorOptions };
  let documentCtx = document;

  if (frameElement) {
    documentCtx = frameElement.contentDocument.body;
    finderOptions.root = documentCtx;
  }

  if (list) {
    const isInList = target.closest('[turium-el-list]');

    if (isInList) {
      const childSelector = findSelector(target, {
        root: isInList,
        ...selectorOptions,
        idName: () => false,
      });
      const listSelector = isInList.getAttribute('turium-el-list');

      selector = `${listSelector} ${childSelector}`;
    } else {
      const parentSelector = findSelector(
        selectedElement.parentElement,
        finderOptions
      );
      selector = `${parentSelector} > ${selectedElement.tagName.toLowerCase()}`;

      const prevSelectedList = documentCtx.querySelectorAll('[turium-el-list]');
      prevSelectedList.forEach((el) => {
        el.removeAttribute('turium-el-list');
      });

      hoveredElements.forEach((el) => {
        el.setAttribute('turium-el-list', selector);
      });
    }
  } else {
    selector =
      selectorType === 'css'
        ? findSelector(selectedElement, finderOptions)
        : generateXPath(selectedElement);
  }

  return selector;
}
