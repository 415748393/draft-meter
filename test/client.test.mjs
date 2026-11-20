// Activation test: runs the Client half the way the browser does — through a
// stubbed React/DOM — then renders the registered dock entry and inspects the
// element tree. It answers "does the plugin turn on, and does it render what it
// claims?" without needing a browser.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSuite, summarise } from './harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const suite = createSuite('client');

// ---- a React small enough to inspect --------------------------------------
// Real React would schedule renders we cannot observe. These stubs keep every
// element as a plain object so the assertions can walk the tree directly.
let hookCursor = 0;
const React = {
  Fragment: Symbol.for('react.fragment'),
  __states: [],
  __cleanups: [],
  createElement(type, props, ...children) {
    const flat = children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false);
    return { type, props: props ?? {}, children: flat };
  },
  useState(initial) {
    const index = hookCursor;
    hookCursor += 1;
    if (!(index in React.__states)) {
      React.__states[index] = typeof initial === 'function' ? initial() : initial;
    }
    const set = (next) => {
      React.__states[index] = typeof next === 'function' ? next(React.__states[index]) : next;
    };
    return [React.__states[index], set];
  },
  useRef(initial) {
    return { current: initial === undefined ? null : initial };
  },
  useCallback(fn) {
    return fn;
  },
  useMemo(fn) {
    return fn();
  },
  // Effects run inline: the test asserts that the listeners a panel needs exist
  // at all, and nothing here re-renders on a schedule, so deferring would only
  // hide them.
  useEffect(fn) {
    React.__cleanups.push(fn());
  },
  useLayoutEffect(fn) {
    React.__cleanups.push(fn());
  },
  useId() {
    return ':draft-meter:';
  },
};

const reactDom = {
  createPortal: (node, container) => ({ portal: node, container }),
};

// ---- a DOM small enough to inspect ---------------------------------------
const styleNodes = [];
const listeners = [];
let activeElement = null;

const documentStub = {
  head: {
    appendChild(node) {
      styleNodes.push(node);
    },
  },
  body: {},
  get activeElement() {
    return activeElement;
  },
  createElement() {
    return { dataset: {}, textContent: '', remove() { this.removed = true; } };
  },
  addEventListener(type, handler, capture) {
    listeners.push({ type, handler, capture: capture === true });
  },
  removeEventListener(type, handler) {
    const index = listeners.findIndex((l) => l.type === type && l.handler === handler);
    if (index !== -1) listeners.splice(index, 1);
  },
};

// ---- a Cordis context small enough to inspect ----------------------------
const localeRegistrations = [];
const slotInjects = [];
const effectLabels = [];

const ctx = {
  effect(factory, label) {
    effectLabels.push(label);
    return factory();
  },
  locale: {
    register(ns, dicts) {
      localeRegistrations.push({ ns, dicts });
      return () => {};
    },
  },
  slots: {
    inject(key, callback) {
      slotInjects.push({ key, registration: callback() });
    },
    register(options, component) {
      return { options, component };
    },
  },
};

// ---- load the Client half ------------------------------------------------
const source = fs.readFileSync(path.join(root, 'client.js'), 'utf8');

function runModule(onModule) {
  const window = {
    __ModuleLoader__: {
      load(spec) {
        onModule(
          spec.factory((id) => {
            if (id === 'react') return React;
            if (id === 'react-dom') return reactDom;
            throw new Error(`unexpected require('${id}')`);
          }),
        );
      },
    },
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener() {},
    removeEventListener() {},
  };
  // The bundle is a classic script: it is executed with the browser globals in
  // scope, exactly as <script> would.
  new Function('window', 'document', 'Node', 'ResizeObserver', source)(
    window,
    documentStub,
    class Node {},
    undefined,
  );
  return window;
}

let moduleHalf = null;
try {
  // First load proves the factory has no side effects: a module that registers
  // styles or timers at parse time survives its own disposal.
  let sideEffects = 0;
  runModule(() => {
    sideEffects += 1;
  });
  suite.check(sideEffects === 1, 'factory returns a module half when loaded');
  suite.check(styleNodes.length === 0, 'loading alone injects no styles');
  suite.equal(effectLabels.length, 0, 'loading alone runs no effects');

  runModule((half) => {
    moduleHalf = half;
  });
} catch (err) {
  suite.fail('client.js threw while loading', err.message);
}

if (moduleHalf === null) {
  suite.fail('module loader never received a module half');
} else {
  suite.check(Array.isArray(moduleHalf.inject), 'module declares inject[]');
  for (const service of ['slots', 'locale']) {
    suite.check(moduleHalf.inject?.includes(service), `module injects the ${service} service`);
  }
  suite.check(typeof moduleHalf.apply === 'function', 'module exposes apply()');
  try {
    moduleHalf.apply(ctx);
    suite.ok('apply() runs against a Cordis-shaped context');
  } catch (err) {
    suite.fail('apply() threw', err.message);
  }
}

// ---- what apply() registered --------------------------------------------
const dictionaries = localeRegistrations.find((entry) => entry.ns === 'draft-meter');
suite.check(dictionaries !== undefined, 'registers the draft-meter locale namespace');

if (dictionaries !== undefined) {
  const { zh, en } = dictionaries.dicts;
  suite.check(typeof zh === 'object' && typeof en === 'object', 'registers both zh and en (baseline locales)');

  const zhKeys = Object.keys(zh ?? {}).sort();
  const enKeys = Object.keys(en ?? {}).sort();
  suite.equal(zhKeys, enKeys, 'zh and en declare the same keys');

  // A placeholder that exists in one language but not the other renders a
  // literal `{count}` to some users.
  const placeholders = (value) => (String(value).match(/\{\w+\}/g) ?? []).sort().join(',');
  const mismatched = enKeys.filter((key) => placeholders(zh?.[key]) !== placeholders(en?.[key]));
  suite.equal(mismatched, [], 'placeholders match between zh and en');

  suite.check(en?.['a11y'] !== undefined, 'en has an accessible label');
  suite.check(zh?.['a11y'] !== undefined, 'zh has an accessible label');
}

suite.check(styleNodes.length === 1, 'injects exactly one style element', String(styleNodes.length));

const css = styleNodes[0]?.textContent ?? '';
if (css !== '') {
  suite.equal(styleNodes[0].dataset?.dshPlugin, 'draft-meter', 'style is tagged with the entry id so it is removable');
  suite.match(css, /--dsw-alias-/, 'styling goes through theme tokens');
  suite.check(!/#[0-9a-fA-F]{3,8}\b/.test(css), 'no literal colours in CSS');
  suite.match(css, /line-height:\s*calc\(20px/, 'the reading keeps the dock on one 20px line');
  suite.match(css, /text-overflow:\s*ellipsis/, 'a long reading ellipsizes');
  suite.match(css, /\.dsh-draft-meter\s*\{[^}]*flex:\s*0 1 auto/, 'the reading shrinks instead of pushing its neighbours off the row');
  suite.match(css, /max-width:\s*min\(100%,\s*\d+(?:\.\d+)?rem\)/, 'the reading has a bounded maximum width');
  suite.check(!/--dsw-alias-separator-primary/.test(css), 'does not reference the undefined separator token');
  suite.match(css, /--dsw-alias-label-caption/, 'the separator dot uses a token that exists');
}

const dockInject = slotInjects.find((entry) => entry.key === 'conversation.composer.dock');
suite.check(dockInject !== undefined, 'injects into conversation.composer.dock');

if (dockInject === undefined) {
  // Nothing more to inspect; the missing injection is already reported.
} else {
  const { options, component } = dockInject.registration;
  suite.equal(options.name, 'conversation.composer.dock', 'register() names the dock slot');
  suite.equal(options.id, 'draft-meter', 'entry id is draft-meter');
  suite.check(options.order >= 2, 'entry sits after the shipped activity and usage readings', String(options.order));
  suite.equal(options.locale, 'draft-meter', 'entry declares its locale namespace');
  suite.check(typeof component === 'function', 'entry provides a component');

  const translateWith = (locale) => (key, params) => {
    const dict = dictionaries?.dicts?.[locale] ?? {};
    let text = dict[key] ?? key;
    for (const [name, value] of Object.entries(params ?? {})) text = text.replace(`{${name}}`, String(value));
    return text;
  };

  // React resolves function components for us; here we do it by hand so the
  // assertions can see real host elements.
  const expand = (node, depth = 0) => {
    if (node === null || node === undefined || typeof node !== 'object') return node;
    if (depth > 20) throw new Error('render tree did not converge');
    // A portal is a marker, not an element: keep the marker (so the test can
    // assert where the panel lands) but still resolve the component inside it.
    if (node.portal !== undefined) {
      return { portal: expand(node.portal, depth + 1), container: node.container };
    }
    if (typeof node.type === 'function') return expand(node.type(node.props), depth + 1);
    return { type: node.type, props: node.props, children: (node.children ?? []).map((c) => expand(c, depth + 1)) };
  };

  const render = (draft, locale = 'en') => {
    hookCursor = 0;
    React.__states = [];
    return expand(component({ useInput: (selector) => selector({ draft }), t: translateWith(locale) }));
  };

  // Text nodes belonging to the reading label, skipping the separator span
  // (which is punctuation, not copy).
  const collectText = (node, acc = []) => {
    if (node === null || node === undefined) return acc;
    if (typeof node !== 'object') {
      acc.push(String(node));
      return acc;
    }
    if (node.props?.className === 'dsh-draft-meter__sep') return acc;
    for (const child of node.children ?? []) collectText(child, acc);
    return acc;
  };

  const readButton = (tree) => tree?.children?.[0]?.children?.[0];
  const labelOf = (tree) => collectText(readButton(tree)).join('').replace(/\s+/g, ' ').trim();

  // ---- the reading itself ------------------------------------------------
  suite.check(render('') === null, 'an empty draft renders nothing at all');

  const blank = render(' ');
  suite.check(blank !== null, 'a draft of only spaces keeps the reading visible rather than flickering');

  const latin = render('Ship the plugin tonight.');
  suite.check(latin !== null, 'a latin draft renders');
  const trigger = latin?.children?.[0];
  suite.equal(trigger?.type, 'span', 'the reading sits in its own span wrapper');
  const button = trigger?.children?.[0];
  suite.equal(button?.type, 'button', 'the reading is a button');
  suite.equal(button?.props.type, 'button', 'the button is type=button so it never submits');
  suite.equal(button?.props['aria-haspopup'], 'dialog', 'the button announces that it opens a dialog');
  suite.equal(button?.props['aria-expanded'], false, 'the button starts collapsed');
  suite.check(button?.props.ref !== undefined, 'the button keeps a ref so focus can return to it');

  const latinLabel = labelOf(latin);
  suite.match(latinLabel, /^draft\b/, 'the reading names its scope so it is not read as a session stat');
  suite.match(latinLabel, /24 chars/, '"Ship the plugin tonight." counts 24 characters');
  suite.match(latinLabel, /≈/, 'the token figure is marked as an estimate');
  suite.match(latinLabel, /tokens/, 'the reading carries a token estimate');

  const glyph = (button?.children ?? []).find((child) => child?.type === 'svg');
  suite.check(glyph !== undefined, 'the reading leads with a glyph like its neighbours');
  suite.equal(glyph?.props.fill, 'currentColor', 'the glyph inherits the theme colour');
  suite.equal(glyph?.props['aria-hidden'], true, 'the glyph is hidden from assistive technology');

  const singular = labelOf(render('a'));
  suite.match(singular, /1 char\b/, 'one character reads "1 char" rather than "1 chars"');

  const cjk = labelOf(render('请帮我把这个插件写好'));
  suite.match(cjk, /10 chars/, 'a CJK draft counts its characters');

  const zhLabel = labelOf(render('请帮我把这个插件写好', 'zh'));
  suite.match(zhLabel, /草稿/, 'the zh reading uses the localized scope word');
  suite.match(zhLabel, /10 字/, 'the zh reading counts the characters');

  suite.check(render('line one\nline two\n\nline four') !== null, 'a multiline draft renders');

  // A slot can be rendered before its services are ready; throwing here would
  // take the whole composer down.
  suite.check(component({ t: translateWith('en') }) === null, 'a missing useInput seat degrades to nothing instead of throwing');

  // ---- the panel --------------------------------------------------------
  const closed = render('Ship the plugin tonight.');
  const closedButton = readButton(closed);
  closedButton.props.onMouseDown({ preventDefault() {}, detail: 1 });
  closedButton.props.onClick({ detail: 1 });

  // Re-render with the hook cursor reset but the hook state kept: that is what
  // React does on the render that follows a setState.
  hookCursor = 0;
  React.__cleanups = [];
  const opened = expand(component({ useInput: (selector) => selector({ draft: 'Ship the plugin tonight.' }), t: translateWith('en') }));

  const portal = (opened.children ?? []).find((child) => child?.portal !== undefined);
  suite.check(portal !== undefined, 'opening portals the panel out of the composer');
  suite.equal(portal?.container, documentStub.body, 'the panel portals to the document body');
  const panel = portal?.portal;
  suite.equal(panel?.props.role, 'dialog', 'the panel is a dialog');
  suite.check(typeof panel?.props['aria-label'] === 'string', 'the panel has an accessible name');
  suite.equal(panel?.props.tabIndex, -1, 'the panel is focusable so keyboard users can reach it');

  const openButton = readButton(opened);
  suite.equal(openButton?.props['aria-expanded'], true, 'the button reports the open state');
  suite.equal(openButton?.props['aria-controls'], panel?.props.id, 'the button points at the panel it controls');

  const listenerTypes = listeners.map((l) => l.type).sort();
  for (const type of ['keydown', 'pointerdown', 'click', 'focusout']) {
    suite.check(listenerTypes.includes(type), `dismisses on ${type}`);
  }
  suite.check(listeners.every((l) => l.capture === true), 'every document listener uses the capture phase');

  // Closing must put the plugin back where it started.
  for (const cleanup of React.__cleanups) if (typeof cleanup === 'function') cleanup();
  suite.equal(listeners.length, 0, 'closing removes every document listener');
}

// ---- report --------------------------------------------------------------
export { suite as clientSuite };

// Running this file directly gives the same report as the combined runner.
if (process.argv[1]?.endsWith('client.test.mjs')) {
  const { text, failed } = summarise([suite]);
  process.stdout.write(text + '\n');
  process.exitCode = failed === 0 ? 0 : 1;
}
