/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import {describe, it} from 'node:test';

import {DOMInspector} from '../../../src/modules/collector/DOMInspector.js';

interface FakeAttr {
  name: string;
  value: string;
}

interface FakeRect {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  left: number;
  right: number;
  bottom: number;
}

interface FakeElement {
  tagName: string;
  nodeName: string;
  id: string;
  className: string;
  textContent: string;
  value?: string;
  attributes: FakeAttr[];
  children: FakeElement[];
  childNodes: Array<{nodeType: number}>;
  parentElement?: FakeElement;
  parentNode?: {children: FakeElement[]};
  getBoundingClientRect: () => FakeRect;
}

interface ComputedStyleStub {
  display: string;
  visibility: string;
  opacity: string;
  position: string;
  'z-index': string;
  width: string;
  height: string;
  top: string;
  left: string;
  right: string;
  bottom: string;
  color: string;
  'background-color': string;
  'font-size': string;
  'font-family': string;
  border: string;
  padding: string;
  margin: string;
  overflow: string;
  getPropertyValue(prop: string): string;
}

interface XPathSnapshot {
  snapshotLength: number;
  snapshotItem(index: number): FakeElement | null;
}

interface DocumentStub {
  body: FakeElement;
  documentElement: {clientHeight: number; clientWidth: number};
  querySelector(sel: string): FakeElement | null;
  querySelectorAll(sel: string): FakeElement[];
  evaluate(xpath: string): XPathSnapshot;
}

interface MutationObserverRecordStub {
  type: string;
  target: FakeElement | null;
  addedNodes: {length: number};
  removedNodes: {length: number};
  attributeName?: string;
}

interface MutationObserverLike {
  observe(): void;
  disconnect(): void;
}

type MutationObserverConstructor = new (
  callback: (records: MutationObserverRecordStub[]) => void,
) => MutationObserverLike;

interface WindowStub {
  innerHeight: number;
  innerWidth: number;
  __domObserver?: MutationObserverLike;
  getComputedStyle(): ComputedStyleStub;
}

interface GlobalDomHarness {
  document?: DocumentStub;
  window?: WindowStub;
  MutationObserver?: MutationObserverConstructor;
  XPathResult?: {ORDERED_NODE_SNAPSHOT_TYPE: number};
}

interface EvaluatePage {
  evaluate<T, Args extends unknown[]>(
    fn: (...args: Args) => T,
    ...args: Args
  ): Promise<T>;
  waitForSelector(selector: string, options: {timeout: number}): Promise<void>;
}

function makeRect(width = 100, height = 30): FakeRect {
  return {
    x: 10,
    y: 20,
    width,
    height,
    top: 20,
    left: 10,
    right: 10 + width,
    bottom: 20 + height,
  };
}

function makeElement(partial: Partial<FakeElement>): FakeElement {
  const el: FakeElement = {
    tagName: partial.tagName ?? 'DIV',
    nodeName: partial.nodeName ?? partial.tagName ?? 'DIV',
    id: partial.id ?? '',
    className: partial.className ?? '',
    textContent: partial.textContent ?? '',
    value: partial.value,
    attributes: partial.attributes ?? [],
    children: partial.children ?? [],
    childNodes: partial.childNodes ?? [{nodeType: 3}],
    getBoundingClientRect: partial.getBoundingClientRect ?? (() => makeRect()),
  };
  el.children.forEach(child => {
    child.parentElement = el;
    child.parentNode = {children: el.children};
  });
  return el;
}

function setupFakeDOM() {
  const button = makeElement({
    tagName: 'BUTTON',
    id: 'submit',
    className: 'btn primary',
    textContent: 'Submit now',
    attributes: [
      {name: 'id', value: 'submit'},
      {name: 'class', value: 'btn primary'},
    ],
  });

  const link = makeElement({
    tagName: 'A',
    className: 'go-link',
    textContent: 'Go',
    attributes: [{name: 'href', value: '/go'}],
  });

  const span = makeElement({
    tagName: 'SPAN',
    className: 'quote-item',
    textContent: 'a"b\'c',
    attributes: [{name: 'class', value: 'quote-item'}],
  });

  const childA = makeElement({
    tagName: 'DIV',
    id: 'childA',
    textContent: 'hello',
  });
  const childB = makeElement({
    tagName: 'DIV',
    className: 'child-b',
    textContent: 'world',
  });
  const body = makeElement({
    tagName: 'BODY',
    id: 'root',
    children: [childA, childB],
  });

  const bySelector: Record<string, FakeElement | null> = {
    '#submit': button,
    '#root': body,
    button: button,
    '.missing': null,
  };

  const bySelectorAll: Record<string, FakeElement[]> = {
    '.item': [button, link, span],
    'button, input[type="button"], input[type="submit"]': [button],
    'a[href]': [link],
  };

  const computed: ComputedStyleStub = {
    display: 'block',
    visibility: 'visible',
    opacity: '1',
    position: 'static',
    'z-index': '1',
    width: '100px',
    height: '30px',
    top: '0px',
    left: '0px',
    right: '0px',
    bottom: '0px',
    color: 'rgb(0,0,0)',
    'background-color': 'rgb(255,255,255)',
    'font-size': '14px',
    'font-family': 'sans-serif',
    border: '0',
    padding: '0',
    margin: '0',
    overflow: 'visible',
    getPropertyValue(prop: string) {
      const value = this[prop as keyof ComputedStyleStub];
      return typeof value === 'string' ? value : '';
    },
  };

  const evaluateResultElements = [span];

  const documentStub: DocumentStub = {
    body,
    documentElement: {clientHeight: 800, clientWidth: 1200},
    querySelector(sel: string) {
      return bySelector[sel] ?? null;
    },
    querySelectorAll(sel: string) {
      return bySelectorAll[sel] ?? [];
    },
    evaluate(_xpath: string) {
      return {
        snapshotLength: evaluateResultElements.length,
        snapshotItem(i: number) {
          return evaluateResultElements[i] ?? null;
        },
      };
    },
  };

  class MutationObserverStub implements MutationObserverLike {
    callback: (records: MutationObserverRecordStub[]) => void;
    observed = false;
    constructor(cb: (records: MutationObserverRecordStub[]) => void) {
      this.callback = cb;
    }
    observe() {
      this.observed = true;
    }
    disconnect() {
      this.observed = false;
    }
  }

  const windowStub: WindowStub = {
    innerHeight: 800,
    innerWidth: 1200,
    getComputedStyle() {
      return computed;
    },
  };

  return {
    documentStub,
    windowStub,
    MutationObserverStub,
  };
}

describe('DOMInspector evaluate execution', () => {
  it('executes browser callbacks to cover DOM logic', async () => {
    const globals = globalThis as unknown as GlobalDomHarness;
    const originals = {
      document: globals.document,
      window: globals.window,
      MutationObserver: globals.MutationObserver,
      XPathResult: globals.XPathResult,
    };

    const {documentStub, windowStub, MutationObserverStub} = setupFakeDOM();
    globals.document = documentStub;
    globals.window = windowStub;
    globals.MutationObserver = MutationObserverStub;
    globals.XPathResult = {ORDERED_NODE_SNAPSHOT_TYPE: 7};

    try {
      const page: EvaluatePage = {
        evaluate: async <T, Args extends unknown[]>(
          fn: (...args: Args) => T,
          ...args: Args
        ) => fn(...args),
        waitForSelector: async () => undefined,
      };

      const inspector = new DOMInspector({
        getActivePage: async () => page,
      } as unknown as ConstructorParameters<typeof DOMInspector>[0]);

      const one = await inspector.querySelector('#submit');
      assert.strictEqual(one.found, true);
      assert.strictEqual(one.nodeName, 'BUTTON');

      const list = await inspector.querySelectorAll('.item', 2);
      assert.strictEqual(list.length, 2);

      const tree = await inspector.getStructure(2, true);
      assert.strictEqual(tree.tag, 'BODY');
      assert.ok(Array.isArray(tree.children));

      const clickable = await inspector.findClickable('sub');
      assert.strictEqual(clickable.length, 1);
      assert.strictEqual(clickable[0]?.type, 'button');

      const styles = await inspector.getComputedStyle('#submit');
      assert.strictEqual(styles?.display, 'block');

      const waited = await inspector.waitForElement('#submit', 10);
      assert.strictEqual(waited?.found, true);

      const byText = await inspector.findByText('a"b\'c', 'span');
      assert.strictEqual(byText.length, 1);

      const xpath = await inspector.getXPath('#submit');
      assert.strictEqual(xpath, '//*[@id="submit"]');

      const viewport = await inspector.isInViewport('#submit');
      assert.strictEqual(viewport, true);

      await inspector.observeDOMChanges({selector: '#root', subtree: true});
      assert.ok(globals.window?.__domObserver);

      await inspector.stopObservingDOM();
      assert.strictEqual(globals.window?.__domObserver, undefined);
    } finally {
      globals.document = originals.document;
      globals.window = originals.window;
      globals.MutationObserver = originals.MutationObserver;
      globals.XPathResult = originals.XPathResult;
    }
  });
});
