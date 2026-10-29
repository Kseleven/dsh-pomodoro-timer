/**
 * Behavioural tests for the Pomodoro Timer client module.
 *
 * The plugin runs inside the Harness Web Client, but its timer store and its
 * React components are plain closures. This harness evaluates client.js in a
 * `node:vm` context with a fake `window` (memory localStorage, captured
 * timers, fake clock) and a tiny React hook shim, so the real shipped code is
 * exercised without a browser or a React installation.
 *
 * Run: node test/run-tests.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '..');
const STORAGE_KEY = 'dsh:pomodoro:timer:v1';
const MIN = 60 * 1000;

/* ----------------------------- fake clock ----------------------------- */

const RealDate = Date;
let clock = new RealDate(2026, 9, 28, 10, 30, 0).getTime();

class FakeDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(clock);
    else super(...args);
  }
  static now() {
    return clock;
  }
}

function setClock(date) {
  clock = date.getTime();
}

function todayString(date = new RealDate(clock)) {
  return (
    date.getFullYear() +
    '-' +
    String(date.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(date.getDate()).padStart(2, '0')
  );
}

/* ------------------------- instrumented source ------------------------ */

const rawSource = fs.readFileSync(path.join(pkgRoot, 'client.js'), 'utf8');
const marker = "    return {\n      inject: ['slots', 'locale'],";
assert.ok(rawSource.includes(marker), 'plugin return block found');

const source = rawSource.replace(
  marker,
  [
    '    return {',
    '      __test: {',
    '        snapshot, start, pause, reset, skip, updateSettings, resetSettings,',
    '        completePhase, tick, PomodoroTimer,',
    '        get state() { return state; },',
    '      },',
    "      inject: ['slots', 'locale'],",
  ].join('\n'),
);

/* ---------------------------- React shim ------------------------------ */

function createReact() {
  const hooks = [];
  const effects = [];
  let index = 0;

  function depsEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((value, i) => Object.is(value, b[i]));
  }

  const React = {
    Fragment: Symbol('Fragment'),
    createElement(type, props, ...children) {
      const merged = props ? { ...props } : {};
      if (children.length === 1) merged.children = children[0];
      else if (children.length > 1) merged.children = children;
      return { type, props: merged };
    },
    useState(initial) {
      const i = index++;
      if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial;
      return [
        hooks[i],
        (next) => {
          hooks[i] = typeof next === 'function' ? next(hooks[i]) : next;
        },
      ];
    },
    useRef(initial) {
      const i = index++;
      if (!(i in hooks)) hooks[i] = { current: initial };
      return hooks[i];
    },
    useEffect(fn, deps) {
      const i = index++;
      const previous = effects[i];
      const run = !previous || !depsEqual(previous.deps, deps);
      if (!run) return;
      if (previous && typeof previous.cleanup === 'function') previous.cleanup();
      const cleanup = fn();
      effects[i] = { deps, cleanup };
    },
  };

  return {
    React,
    hooks,
    reset() {
      index = 0;
    },
  };
}

function expand(element, React) {
  if (element == null || element === false || element === true) return null;
  if (typeof element === 'string' || typeof element === 'number') return element;
  if (Array.isArray(element)) return element.map((child) => expand(child, React));
  if (typeof element !== 'object') return element;

  const { type, props } = element;
  if (typeof type === 'function') {
    if (type === React.Fragment) return expand(props.children, React);
    return expand(type(props), React);
  }
  return { type, props: { ...props, children: expand(props.children, React) } };
}

function flatten(node, out = []) {
  if (node == null) return out;
  if (Array.isArray(node)) {
    for (const child of node) flatten(child, out);
    return out;
  }
  if (typeof node !== 'object') return out;
  out.push(node);
  flatten(node.props.children, out);
  return out;
}

function textOf(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node !== 'object') return '';
  const children = node.props.children;
  return Array.isArray(children) ? children.map(textOf).join('') : textOf(children);
}

function findAll(root, predicate) {
  return flatten(root).filter(predicate);
}

function findByClass(root, className) {
  return findAll(root, (node) => node.props.className === className)[0] || null;
}

function findButton(root, ariaLabel) {
  return (
    findAll(
      root,
      (node) => node.type === 'button' && node.props['aria-label'] === ariaLabel,
    )[0] || null
  );
}

/* ----------------------------- fake window ---------------------------- */

function createEnv(options = {}) {
  const store = new Map();
  if (options.saved !== undefined) {
    store.set(STORAGE_KEY, typeof options.saved === 'string' ? options.saved : JSON.stringify(options.saved));
  }

  const timers = new Map();
  let sequence = 0;

  const window = {
    localStorage: {
      getItem(key) {
        return store.has(key) ? store.get(key) : null;
      },
      setItem(key, value) {
        store.set(key, String(value));
      },
      removeItem(key) {
        store.delete(key);
      },
    },
    setInterval(fn) {
      sequence += 1;
      timers.set(sequence, fn);
      return sequence;
    },
    clearInterval(id) {
      timers.delete(id);
    },
    setTimeout(fn) {
      sequence += 1;
      timers.set(sequence, fn);
      return sequence;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    Notification: undefined,
    AudioContext: undefined,
    webkitAudioContext: undefined,
  };

  const sandbox = {
    window,
    document: {
      addEventListener() {},
      removeEventListener() {},
    },
    console,
    Date: FakeDate,
    JSON,
    Math,
    Number,
    String,
    Boolean,
    Object,
    Array,
    Promise,
    Set,
    Map,
    Intl,
    parseInt,
    parseFloat,
    isFinite,
    setTimeout: window.setTimeout,
    clearTimeout: window.clearTimeout,
  };
  vm.createContext(sandbox);

  let captured = null;
  window.__ModuleLoader__ = {
    load(mod) {
      captured = mod;
    },
  };

  vm.runInContext(source, sandbox, { filename: path.join(pkgRoot, 'client.js') });
  assert.ok(captured, 'module was registered');
  assert.equal(captured.id, 'dsh-pomodoro-card');

  const stub = createReact();
  const plugin = captured.factory((name) => {
    assert.equal(name, 'react', 'only react is required');
    return stub.React;
  });
  assert.ok(plugin.__test, 'test hooks exposed');

  return {
    plugin,
    api: plugin.__test,
    stub,
    window,
    store,
    timers,
    render(component, props) {
      stub.reset();
      return expand(component(props), stub.React);
    },
    pumpTimers() {
      for (const fn of [...timers.values()]) fn();
    },
    saved() {
      const raw = store.get(STORAGE_KEY);
      return raw === undefined ? null : JSON.parse(raw);
    },
  };
}

/* ------------------------------- tests -------------------------------- */

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
    console.log('ok   - ' + name);
  } catch (error) {
    results.push({ name, ok: false, error });
    console.log('FAIL - ' + name);
    console.log(error && error.stack ? error.stack : error);
  }
}

function baseSettings(overrides = {}) {
  return {
    focus: 25,
    short: 5,
    long: 15,
    longEvery: 4,
    autoStart: true,
    sound: false,
    notify: false,
    ...overrides,
  };
}

test('initial state is an idle 25 minute focus session', () => {
  setClock(new RealDate(2026, 9, 28, 10, 30, 0));
  const env = createEnv();
  assert.equal(env.api.state.phase, 'focus');
  assert.equal(env.api.state.running, false);
  assert.equal(env.api.state.endsAt, null);
  assert.equal(env.api.state.remainingMs, 25 * MIN);
  assert.equal(env.api.state.completedFocus, 0);
  assert.equal(env.api.state.today.date, '2026-10-28');
  assert.equal(env.api.state.today.count, 0);
  assert.equal(env.timers.size, 0, 'no ticker before start');
});

test('start arms an absolute deadline and the ticker counts down', () => {
  setClock(new RealDate(2026, 9, 28, 10, 30, 0));
  const env = createEnv();
  env.api.start();
  assert.equal(env.api.state.running, true);
  assert.equal(env.api.state.endsAt, clock + 25 * MIN);
  assert.equal(env.timers.size, 1);

  clock += MIN;
  env.pumpTimers();
  assert.equal(env.api.state.running, true);
  assert.equal(env.api.state.endsAt, new RealDate(2026, 9, 28, 10, 30, 0).getTime() + 25 * MIN);

  const saved = env.saved();
  assert.equal(saved.phase, 'focus');
  assert.equal(saved.running, true);
  assert.equal(saved.endsAt, new RealDate(2026, 9, 28, 10, 30, 0).getTime() + 25 * MIN);
});

test('focus completion rolls into a running short break and records the day', () => {
  setClock(new RealDate(2026, 9, 28, 10, 30, 0));
  const env = createEnv();
  env.api.start();
  clock = env.api.state.endsAt;
  env.pumpTimers();

  assert.equal(env.api.state.phase, 'short');
  assert.equal(env.api.state.running, true, 'autoStart default is on');
  assert.equal(env.api.state.completedFocus, 1);
  assert.equal(env.api.state.today.date, '2026-10-28');
  assert.equal(env.api.state.today.count, 1);
  assert.equal(env.api.state.endsAt, clock + 5 * MIN);
  assert.equal(env.timers.size, 1, 'ticker continues for the break');

  const saved = env.saved();
  assert.equal(saved.phase, 'short');
  assert.equal(saved.completedFocus, 1);
  assert.equal(saved.today.count, 1);
});

test('break completion returns to focus without counting', () => {
  setClock(new RealDate(2026, 9, 28, 10, 30, 0));
  const env = createEnv();
  env.api.start();
  clock = env.api.state.endsAt;
  env.pumpTimers();
  clock = env.api.state.endsAt;
  env.pumpTimers();

  assert.equal(env.api.state.phase, 'focus');
  assert.equal(env.api.state.completedFocus, 1);
  assert.equal(env.api.state.today.count, 1);
  assert.equal(env.api.state.running, true);
});

test('fourth completed focus starts a long break', () => {
  setClock(new RealDate(2026, 9, 28, 10, 30, 0));
  const env = createEnv();
  env.api.start();
  clock = env.api.state.endsAt;
  env.pumpTimers(); // focus 1 -> short

  for (let i = 2; i <= 4; i += 1) {
    clock = env.api.state.endsAt;
    env.pumpTimers(); // short -> focus
    assert.equal(env.api.state.phase, 'focus');
    clock = env.api.state.endsAt;
    env.pumpTimers(); // focus -> break
    if (i === 4) {
      assert.equal(env.api.state.phase, 'long');
      assert.equal(env.api.state.completedFocus, 4);
      assert.equal(env.api.state.today.count, 4);
      assert.equal(env.api.state.endsAt, clock + 15 * MIN);
    } else {
      assert.equal(env.api.state.phase, 'short');
    }
  }
});

test('autoStart off leaves the next phase paused', () => {
  setClock(new RealDate(2026, 9, 28, 10, 30, 0));
  const env = createEnv();
  env.api.updateSettings('autoStart', false);
  env.api.start();
  clock = env.api.state.endsAt;
  env.pumpTimers();

  assert.equal(env.api.state.phase, 'short');
  assert.equal(env.api.state.running, false);
  assert.equal(env.api.state.endsAt, null);
  assert.equal(env.api.state.remainingMs, 5 * MIN);
  assert.equal(env.timers.size, 0, 'ticker stopped while paused');
});

test('pause keeps the remaining time and resume re-arms the deadline', () => {
  setClock(new RealDate(2026, 9, 28, 10, 30, 0));
  const env = createEnv();
  env.api.start();
  clock += 90 * 1000;
  env.api.pause();

  assert.equal(env.api.state.running, false);
  assert.equal(env.api.state.endsAt, null);
  assert.equal(env.api.state.remainingMs, 25 * MIN - 90 * 1000);
  assert.equal(env.timers.size, 0);

  clock += 30 * 1000;
  env.api.start();
  assert.equal(env.api.state.endsAt, clock + 25 * MIN - 90 * 1000);

  clock = env.api.state.endsAt;
  env.pumpTimers();
  assert.equal(env.api.state.phase, 'short');
});

test('reset restores the full duration of the current phase', () => {
  setClock(new RealDate(2026, 9, 28, 10, 30, 0));
  const env = createEnv();
  env.api.start();
  clock += 5 * MIN;
  env.api.reset();

  assert.equal(env.api.state.running, false);
  assert.equal(env.api.state.remainingMs, 25 * MIN);
  assert.equal(env.timers.size, 0);
});

test('skip advances focus to a paused short break and does not count', () => {
  setClock(new RealDate(2026, 9, 28, 10, 30, 0));
  const env = createEnv();
  env.api.start();
  env.api.skip();

  assert.equal(env.api.state.phase, 'short');
  assert.equal(env.api.state.running, false);
  assert.equal(env.api.state.remainingMs, 5 * MIN);
  assert.equal(env.api.state.completedFocus, 0);
  assert.equal(env.api.state.today.count, 0);

  env.api.skip();
  assert.equal(env.api.state.phase, 'focus');
  assert.equal(env.api.state.remainingMs, 25 * MIN);
});

test('settings are clamped and persisted', () => {
  setClock(new RealDate(2026, 9, 28, 10, 30, 0));
  const env = createEnv();
  env.api.updateSettings('focus', 500);
  assert.equal(env.api.state.settings.focus, 120);
  assert.equal(env.api.state.remainingMs, 120 * MIN, 'idle timer follows the new length');

  env.api.updateSettings('short', 0);
  assert.equal(env.api.state.settings.short, 1);

  env.api.updateSettings('longEvery', 9);
  assert.equal(env.api.state.settings.longEvery, 8);

  env.api.updateSettings('long', 'nope');
  assert.equal(env.api.state.settings.long, 15);

  env.api.updateSettings('autoStart', 1);
  assert.equal(env.api.state.settings.autoStart, true);

  const saved = env.saved();
  assert.equal(saved.settings.focus, 120);
  assert.equal(saved.settings.longEvery, 8);
});

test('resetSettings restores defaults', () => {
  setClock(new RealDate(2026, 9, 28, 10, 30, 0));
  const env = createEnv();
  env.api.updateSettings('focus', 40);
  env.api.resetSettings();
  assert.equal(env.api.state.settings.focus, 25);
  assert.equal(env.api.state.remainingMs, 25 * MIN);
});

test('corrupt storage falls back to a fresh state', () => {
  setClock(new RealDate(2026, 9, 28, 10, 30, 0));
  const broken = createEnv({ saved: '{not json' });
  assert.equal(broken.api.state.phase, 'focus');
  assert.equal(broken.api.state.remainingMs, 25 * MIN);

  const invalid = createEnv({
    saved: { phase: 'nope', running: true, endsAt: 'x', remainingMs: -4, settings: { focus: 0, short: -2 } },
  });
  assert.equal(invalid.api.state.phase, 'focus');
  assert.equal(invalid.api.state.running, false);
  assert.equal(invalid.api.state.settings.focus, 1, 'clamped to min');
  assert.equal(invalid.api.state.settings.short, 1);
  assert.equal(invalid.api.state.remainingMs, 1 * MIN, 'duration follows clamped focus');
});

test('reload restores a running timer against the wall clock', () => {
  setClock(new RealDate(2026, 9, 28, 10, 30, 0));
  const first = createEnv();
  first.api.start();
  clock += 120 * 1000;
  const persisted = first.saved();

  const second = createEnv({ saved: persisted });
  assert.equal(second.api.state.running, true);
  assert.equal(second.api.state.endsAt, persisted.endsAt);
  assert.equal(second.timers.size, 1, 'ticker resumes on load');
  clock = second.api.state.endsAt;
  second.pumpTimers();
  assert.equal(second.api.state.phase, 'short');
  assert.equal(second.api.state.completedFocus, 1);
});

test('reload after the deadline completes the phase silently', () => {
  setClock(new RealDate(2026, 9, 28, 10, 30, 0));
  const overdue = createEnv({
    saved: {
      phase: 'focus',
      running: true,
      endsAt: clock - MIN,
      remainingMs: MIN,
      completedFocus: 2,
      today: { date: '2026-10-28', count: 2 },
      settings: baseSettings(),
    },
  });

  assert.equal(overdue.api.state.phase, 'short');
  assert.equal(overdue.api.state.running, true);
  assert.equal(overdue.api.state.completedFocus, 3);
  assert.equal(overdue.api.state.today.count, 3);
  assert.equal(overdue.api.state.endsAt, clock + 5 * MIN);
  assert.equal(overdue.timers.size, 1);
});

test('a new calendar day resets the daily count', () => {
  setClock(new RealDate(2026, 9, 29, 0, 30, 0));
  const env = createEnv({
    saved: {
      phase: 'focus',
      running: false,
      endsAt: null,
      remainingMs: 25 * MIN,
      completedFocus: 2,
      today: { date: '2026-10-28', count: 5 },
      settings: baseSettings(),
    },
  });

  assert.equal(env.api.state.today.date, '2026-10-29');
  assert.equal(env.api.state.today.count, 0);
  env.api.start();
  clock = env.api.state.endsAt;
  env.pumpTimers();
  assert.equal(env.api.state.today.count, 1);
  assert.equal(env.api.state.completedFocus, 3);

  setClock(new RealDate(2026, 9, 28, 10, 30, 0));
});

test('plugin registers the dock entry with translations', () => {
  setClock(new RealDate(2026, 9, 28, 10, 30, 0));
  const env = createEnv();
  const registrations = [];
  const effects = [];
  const ctx = {
    effect(fn) {
      effects.push(fn);
      return fn();
    },
    locale: {
      register(namespace, dictionaries) {
        assert.equal(namespace, 'pomodoro-timer');
        assert.ok(dictionaries.zh['phase.focus']);
        assert.ok(dictionaries.en['phase.focus']);
        return () => {};
      },
      bind(namespace) {
        assert.equal(namespace, 'pomodoro-timer');
        return (key) => key;
      },
    },
    slots: {
      inject(name, factory) {
        assert.equal(name, 'conversation.composer.dock');
        const iterator = factory();
        const step = iterator.next();
        assert.equal(step.done, false);
      },
      register(options, component) {
        registrations.push({ options, component });
        return () => {};
      },
    },
  };

  env.plugin.apply(ctx);
  assert.equal(registrations.length, 1);
  const { options, component } = registrations[0];
  assert.equal(options.name, 'conversation.composer.dock');
  assert.equal(options.id, 'pomodoro-timer');
  assert.equal(options.order, 2);
  const injected = options.inject();
  assert.equal(typeof injected.t, 'function');
  assert.equal(component, env.api.PomodoroTimer);
  assert.ok(effects.length >= 2);
});

test('component renders the idle timer, settings panel and controls', () => {
  setClock(new RealDate(2026, 9, 28, 10, 30, 0));
  const env = createEnv();
  const t = (key) => key;
  const Component = env.api.PomodoroTimer;

  let tree = env.render(Component, { t });
  assert.equal(textOf(findByClass(tree, 'dsh-pomodoro__time')), '25:00');
  assert.equal(textOf(findByClass(tree, 'dsh-pomodoro__phase')), 'phase.focus');
  assert.equal(findAll(tree, (node) => node.props.className === 'dsh-pomodoro__dot').length, 4);
  assert.ok(findByClass(tree, 'dsh-pomodoro__settings') === null, 'settings are collapsed');
  assert.ok(findButton(tree, 'action.start'));
  assert.ok(findButton(tree, 'action.reset'));
  assert.ok(findButton(tree, 'action.skip'));
  assert.ok(findButton(tree, 'action.settings'));
  assert.ok(findAll(tree, (node) => node.type === 'circle').length >= 2, 'progress ring drawn');
  assert.ok(findAll(tree, (node) => node.type === 'style').length === 1, 'scoped stylesheet rendered');

  // Open settings and confirm the four fields and three toggles.
  findButton(tree, 'action.settings').props.onClick();
  tree = env.render(Component, { t });
  const settingsPanel = findByClass(tree, 'dsh-pomodoro__settings');
  assert.ok(settingsPanel, 'settings panel visible');
  const inputs = findAll(tree, (node) => node.type === 'input');
  const numberInputs = inputs.filter((node) => node.props.type === 'number');
  const checkboxInputs = inputs.filter((node) => node.props.type === 'checkbox');
  assert.equal(numberInputs.length, 4);
  assert.equal(checkboxInputs.length, 3);
  assert.equal(numberInputs.map((node) => node.props.value).join(','), '25,5,15,4');

  // Editing a field commits on blur.
  const focusInput = numberInputs[0];
  focusInput.props.onChange({ target: { value: '30' } });
  tree = env.render(Component, { t });
  const editedFocus = findAll(
    env.render(Component, { t }),
    (node) => node.type === 'input' && /-focus$/.test(String(node.props.id)),
  )[0];
  assert.equal(editedFocus.props.value, '30');
  editedFocus.props.onBlur();
  assert.equal(env.api.state.settings.focus, 30);
  assert.equal(env.api.state.remainingMs, 30 * MIN);
  assert.equal(env.saved().settings.focus, 30);
  assert.equal(textOf(findByClass(env.render(Component, { t }), 'dsh-pomodoro__time')), '30:00');

  // Clamping happens on commit as well.
  const shortInput = findAll(
    env.render(Component, { t }),
    (node) => node.type === 'input' && /-short$/.test(String(node.props.id)),
  )[0];
  shortInput.props.onChange({ target: { value: '999' } });
  tree = env.render(Component, { t });
  const editedShort = findAll(
    tree,
    (node) => node.type === 'input' && /-short$/.test(String(node.props.id)),
  )[0];
  editedShort.props.onBlur();
  assert.equal(env.api.state.settings.short, 60);
  assert.equal(env.saved().settings.short, 60);

  // Close the panel.
  tree = env.render(Component, { t });
  findButton(tree, 'action.closeSettings').props.onClick();
  tree = env.render(Component, { t });
  assert.ok(findByClass(tree, 'dsh-pomodoro__settings') === null);
});

test('component starts, counts down and reports the next phase', () => {
  setClock(new RealDate(2026, 9, 28, 10, 30, 0));
  const env = createEnv();
  const t = (key) => key;
  const Component = env.api.PomodoroTimer;

  let tree = env.render(Component, { t });
  findButton(tree, 'action.start').props.onClick();
  assert.equal(env.api.state.running, true);

  clock += 60 * 1000;
  env.pumpTimers();
  tree = env.render(Component, { t });
  assert.equal(textOf(findByClass(tree, 'dsh-pomodoro__time')), '24:00');
  assert.ok(findButton(tree, 'action.pause'));

  clock = env.api.state.endsAt;
  env.pumpTimers();
  tree = env.render(Component, { t });
  assert.equal(env.api.state.phase, 'short');
  assert.equal(textOf(findByClass(tree, 'dsh-pomodoro__phase')), 'phase.short');
  assert.equal(textOf(findByClass(tree, 'dsh-pomodoro__time')), '05:00');
  const dots = findAll(tree, (node) => node.props.className === 'dsh-pomodoro__dot');
  assert.equal(dots.filter((node) => node.props['data-on'] === 'true').length, 1);

  // Pause and resume through the ring control.
  clock += 30 * 1000;
  env.pumpTimers();
  tree = env.render(Component, { t });
  findButton(tree, 'action.pause').props.onClick();
  assert.equal(env.api.state.running, false);
  tree = env.render(Component, { t });
  assert.ok(findButton(tree, 'action.resume'));
  findButton(tree, 'action.resume').props.onClick();
  assert.equal(env.api.state.running, true);
});

test('component announces phase completion and lets the reminder be dismissed', () => {
  setClock(new RealDate(2026, 9, 28, 10, 30, 0));
  const env = createEnv();
  const t = (key) => key;
  const Component = env.api.PomodoroTimer;

  let tree = env.render(Component, { t });
  assert.ok(findByClass(tree, 'dsh-pomodoro__alert') === null, 'no reminder before completion');

  findButton(tree, 'action.start').props.onClick();
  clock = env.api.state.endsAt;
  env.pumpTimers();
  tree = env.render(Component, { t });

  const alert = findByClass(tree, 'dsh-pomodoro__alert');
  assert.ok(alert, 'reminder appears when the phase ends');
  assert.equal(alert.props.role, 'status');
  const alertText = textOf(alert);
  assert.ok(alertText.includes('alert.focusDone'), 'focus completion announced: ' + alertText);
  assert.ok(alertText.includes('alert.next'), 'next phase announced');
  assert.ok(alertText.includes('alert.autoStarted'), 'auto-start mentioned');
  assert.equal(env.api.state.completion.wasFocus, true);
  assert.equal(env.api.state.running, true);
  assert.equal(env.api.state.phase, 'short');

  findButton(tree, 'action.dismiss').props.onClick();
  tree = env.render(Component, { t });
  assert.ok(findByClass(tree, 'dsh-pomodoro__alert') === null, 'reminder dismissed');

  // A paused hand-off is explained too (autoStart off).
  env.api.updateSettings('autoStart', false);
  clock = env.api.state.endsAt;
  env.pumpTimers();
  tree = env.render(Component, { t });
  assert.equal(env.api.state.running, false);
  assert.ok(textOf(findByClass(tree, 'dsh-pomodoro__alert')).includes('alert.waiting'));
});

test('notifications report an unsupported environment instead of enabling', () => {
  setClock(new RealDate(2026, 9, 28, 10, 30, 0));
  const env = createEnv();
  const t = (key) => key;
  const Component = env.api.PomodoroTimer;

  let tree = env.render(Component, { t });
  findButton(tree, 'action.settings').props.onClick();
  tree = env.render(Component, { t });

  const notifyLabel = findAll(tree, (node) => node.type === 'label' && textOf(node) === 'settings.notify')[0];
  assert.ok(notifyLabel, 'notification checkbox rendered');
  const notifyInput = findAll(notifyLabel, (node) => node.type === 'input')[0];
  notifyInput.props.onChange({ target: { checked: true } });
  assert.equal(env.api.state.settings.notify, false, 'must not enable without permission');

  tree = env.render(Component, { t });
  const notice = findAll(tree, (node) => node.props.role === 'alert')[0];
  assert.ok(notice);
  assert.equal(textOf(notice), 'settings.notifyUnsupported');
});

test('completePhase is idempotent for focus increments per phase', () => {
  setClock(new RealDate(2026, 9, 28, 10, 30, 0));
  const env = createEnv();
  env.api.completePhase({ silent: true });
  assert.equal(env.api.state.phase, 'short');
  assert.equal(env.api.state.completedFocus, 1);
  env.api.completePhase({ silent: true });
  assert.equal(env.api.state.phase, 'focus');
  assert.equal(env.api.state.completedFocus, 1);
  assert.equal(env.api.state.today.count, 1);
});

/* ------------------------------ summary ------------------------------- */

const failed = results.filter((entry) => !entry.ok);
console.log('\n' + (results.length - failed.length) + ' passed, ' + failed.length + ' failed');
if (failed.length > 0) process.exitCode = 1;
