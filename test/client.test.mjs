/**
 * Functional verification for the archived-sessions browser half.
 *
 * Runs client.js exactly the way the shell does — through the module loader,
 * with a React stand-in and stub services — then checks the registrations it
 * makes, renders the page, and drives the delete flow to its confirmation
 * button.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = fileURLToPath(new URL('.', import.meta.url));
const source = process.env.VERIFY_CLIENT ?? join(here, '..', 'client.js');

const results = [];
function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail });
}
function equal(name, actual, expected) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/* ---------------------------------------------------------------- React stand-in */

const hookState = [];
let hookCursor = 0;
const effects = [];

const React = {
  createElement(type, props, ...children) {
    const flat = [];
    const push = (child) => {
      if (Array.isArray(child)) child.forEach(push);
      else if (child !== null && child !== undefined && child !== false) flat.push(child);
    };
    children.forEach(push);
    return { type, props: props ?? {}, children: flat };
  },
  useState(initial) {
    const index = hookCursor++;
    if (!(index in hookState)) hookState[index] = initial;
    const set = (next) => {
      hookState[index] = typeof next === 'function' ? next(hookState[index]) : next;
    };
    return [hookState[index], set];
  },
  useCallback(fn) {
    hookCursor++;
    return fn;
  },
  useEffect(fn) {
    hookCursor++;
    effects.push(fn);
  },
  useMemo(fn) {
    hookCursor++;
    return fn();
  },
  useRef(value) {
    hookCursor++;
    return { current: value };
  },
};

function render(component, props) {
  hookCursor = 0;
  effects.length = 0;
  const tree = component(props);
  const pending = effects.splice(0);
  for (const effect of pending) effect();
  return tree;
}

function texts(node, found = []) {
  if (typeof node === 'string' || typeof node === 'number') found.push(String(node));
  else if (node && typeof node === 'object') {
    if (node.props?.title) found.push(String(node.props.title));
    for (const child of node.children ?? []) texts(child, found);
  }
  return found;
}

function buttons(node, found = []) {
  if (node && typeof node === 'object') {
    if (node.type === 'button') found.push(node);
    for (const child of node.children ?? []) buttons(child, found);
  }
  return found;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 5));

/* ---------------------------------------------------------------- module loader */

let definition;
// client.js is a classic script that talks to the shell through this global.
globalThis.window = { __ModuleLoader__: { load: (value) => { definition = value; } } };
const sourceText = await readFile(source, 'utf8');
vm.runInThisContext(sourceText, { filename: source });
check('client.js registers itself with the module loader', Boolean(definition));

const moduleExports = definition.factory((id) => {
  if (id === 'react') return React;
  throw new Error(`unexpected module request: ${id}`);
});
check('the bundle id matches its package name', definition.id === '@local/archived-sessions', String(definition.id));
equal('the client plugin injects the services it uses', moduleExports.inject, ['slots', 'locale', 'remote']);

/* ---------------------------------------------------------------- stub services */

const localeDictionaries = {};
let localeLanguage = 'zh';
const missingKeys = [];
function interpolate(template, params) {
  return String(template).replace(/\{(\w+)\}/g, (whole, key) => (
    params && key in params ? String(params[key]) : whole
  ));
}

const registrations = [];
const contributions = [];
let unmounts = 0;
const sessionList = [
  { sessionId: 'session-1', title: '第一个会话', cwd: 'C:\\Users\\test\\project', lastPromptAt: Date.UTC(2024, 4, 4, 8, 30), bytes: 2048, files: 2, onDisk: true, directory: 'C:\\x' },
  { sessionId: 'session-2', title: null, cwd: null, lastPromptAt: null, createdAt: Date.UTC(2024, 0, 2), bytes: 0, files: 0, onDisk: false, directory: null },
];
const apiCalls = [];
const HOST_ENDPOINTS = ['archivedSessions/list', 'archivedSessions/deleteSession'];
let hostEndpoints = HOST_ENDPOINTS;
const remoteApi = {
  async list() {
    apiCalls.push('list');
    return { ok: true, value: { home: 'C:\\home', endpoints: hostEndpoints, sessions: sessionList } };
  },
  async deleteSession(sessionId) {
    apiCalls.push(`deleteSession:${sessionId}`);
    return { ok: true, value: { sessionId, directory: true, cache: true } };
  },
};

const ctx = {
  effect: (fn) => fn(),
  get: (name) => (name === 'remote.archivedSessions' ? remoteApi : undefined),
  remote: {
    async $mount(contribution) {
      contributions.push(contribution);
      // The real gateway refuses a second mount of the same endpoint, so the
      // stub does too: mounting twice must fail this suite, not just the GUI.
      if (contributions.length > 1) {
        throw new Error(`client api: direct method ${contribution.descriptors[0].namespace}/${contribution.descriptors[0].method} is already mounted`);
      }
      return () => {
        unmounts += 1;
      };
    },
  },
  locale: {
    register: (namespace, dictionaries) => {
      localeDictionaries[namespace] = dictionaries;
    },
    bind: (namespace) => (key, params) => {
      const dictionary = localeDictionaries[namespace]?.[localeLanguage] ?? {};
      if (!(key in dictionary)) missingKeys.push(`${namespace}.${key}`);
      return interpolate(dictionary[key] ?? key, params);
    },
  },
  slots: {
    inject: (owner, callback) => {
      registrations.push({ owner, ...callback() });
    },
    register: (options, Component) => {
      registrations.push({ owner: options.name, options, Component });
      return () => {};
    },
  },
  logger: { info() {}, warn() {}, error() {} },
};

await moduleExports.apply(ctx);

/* ---------------------------------------------------------------- registration */

const localeEntry = registrations.find((entry) => entry.options === undefined && entry.owner === undefined);
const main = registrations.find((entry) => entry.options?.name === 'main');
const sidebar = registrations.find((entry) => entry.options?.name === 'sidebar.panellist');

check('dictionaries are registered for the namespace', Boolean(localeDictionaries['archived-sessions']?.zh && localeDictionaries['archived-sessions']?.en));
check('a page is registered into the main slot', Boolean(main?.Component), JSON.stringify(registrations.map((entry) => entry.options?.name ?? entry.owner)));
equal('the page key and locale namespace are set', [main.options.key, main.options.locale], ['archived-sessions', 'archived-sessions']);
check('a sidebar entry is registered', Boolean(sidebar?.Component));
equal('the sidebar entry id selects the page', [sidebar.options.id, sidebar.options.order, sidebar.options.locale], ['archived-sessions', 20, 'archived-sessions']);
check('the sidebar label is localized', sidebar.options.label() === '已归档会话', sidebar.options.label());
void localeEntry;

/* ---------------------------------------------------------------- remote contribution */

equal('one Remote contribution is mounted', contributions.length, 1);
const [contribution] = contributions;
equal('the contribution names its package', contribution.package, '@local/archived-sessions');
equal('both remote methods are declared', contribution.descriptors.map((d) => `${d.namespace}/${d.method}`), ['archivedSessions/list', 'archivedSessions/deleteSession']);
const [listDescriptor, deleteDescriptor] = contribution.descriptors;
equal('list takes no arguments', listDescriptor.parameters, []);
equal('deleteSession takes exactly the session id', deleteDescriptor.parameters.map((p) => [p.name, p.wire, p.source]), [['sessionId', 'sessionId', 'json']]);
check('source-mode inputs declare a strict codec', deleteDescriptor.parameters.every((p) => p.codec?.mode === 'strict'));
check('results travel as source JSON', contribution.descriptors.every((d) => d.result?.mode === 'src-json'));

/*
 * The client installs each endpoint as a property of its namespace service, so
 * a method name the namespace service already owns makes mounting throw
 * ("conflicts with its namespace service"). Reserved names, from
 * dsh-api-gateway/lib/types/client/index.js: `REMOTE_NAMESPACE_FIELDS` plus
 * every `RemoteNamespaceService.prototype` member.
 */
const RESERVED_ENDPOINT_NAMES = new Set([
  'ctx', 'empty', 'invokeRemote', 'methods', 'name', 'namespace',
  'has', 'install', 'installDirect', 'installScoped', 'remove',
]);
check('endpoint names avoid the namespace service', contribution.descriptors.every((d) => !RESERVED_ENDPOINT_NAMES.has(d.method)), contribution.descriptors.map((d) => d.method).join(','));

/* ---------------------------------------------------------------- rendering */

let tree;
try {
  tree = render(main.Component, {});
  check('the page renders without throwing', true);
} catch (error) {
  check('the page renders without throwing', false, String((error && error.stack) || error));
}

await flush();
tree = render(main.Component, {});

const rendered = texts(tree).join(' | ');
check('the heading and subtitle are localized', rendered.includes('已归档会话') && rendered.includes('无法恢复'), rendered.slice(0, 160));
check('the panel shows which home it reads', rendered.includes('C:\\home'), rendered.slice(0, 200));
check('rows show the session title', rendered.includes('第一个会话'), rendered.slice(0, 240));
check('untitled sessions fall back to a placeholder', rendered.includes('未命名会话'), rendered.slice(0, 240));
check('rows show a formatted size', rendered.includes('2 KB'), rendered.slice(0, 240));
check('missing files are called out', rendered.includes('文件已不在'), rendered.slice(0, 240));
check('the session count is shown', rendered.includes('共 2 个会话'), rendered.slice(0, 240));
equal('listing called the remote service', apiCalls.filter((call) => call === 'list').length >= 1, true);

const allButtons = buttons(tree);
const actionButtons = allButtons.filter((button) => texts(button).includes('彻底删除'));
check('the header offers a refresh action', allButtons.some((button) => texts(button).includes('刷新')), texts(allButtons[0]).join(','));
equal('every row offers exactly one action', actionButtons.length, 2);
check('the action is labelled', texts(actionButtons[0]).includes('彻底删除'), texts(actionButtons[0]).join(','));

/* ---------------------------------------------------------------- delete flow */

let confirming;

try {

actionButtons[0]?.props.onClick?.();
confirming = render(main.Component, {});
let confirmButtons = buttons(confirming);
check('the row asks for confirmation first', texts(confirming).some((text) => text.includes('无法恢复')), texts(confirming).slice(0, 6).join(' | '));
check('confirmation has not called the remote service yet', !apiCalls.some((call) => call.startsWith('deleteSession:')), apiCalls.join(','));

const confirmButton = confirmButtons.find((button) => texts(button).includes('确认删除'));
check('a confirmation button is offered', Boolean(confirmButton), confirmButtons.map((button) => texts(button).join('')).join(' | '));
confirmButton?.props.onClick?.();
await flush();
confirming = render(main.Component, {});
check('confirming deletes exactly that session', apiCalls.includes('deleteSession:session-1'), apiCalls.join(','));
check('a success notice is shown', texts(confirming).some((text) => text.includes('已删除 session-1')), texts(confirming).slice(0, 6).join(' | '));
check('the list is refreshed after a deletion', apiCalls.filter((call) => call === 'list').length >= 2, apiCalls.join(','));

} catch (error) {
  check('the interaction flow ran to completion', false, String((error && error.stack) || error));
}

/* ---------------------------------------------------------------- locality */

equal('every used translation key exists', missingKeys, []);

/*
 * The page must reuse the activation's single mount: a second `$mount` for the
 * same endpoints is refused by the gateway, which surfaced as
 * "direct method archivedSessions/list is already mounted" in the panel.
 */
equal('the contribution is mounted once for the whole session', contributions.length, 1, );
equal('no redeclaration happened while rendering and deleting', unmounts, 0);

/*
 * A Host whose module predates a method rename answers `list` but exposes the
 * old name, so the delete call would die as "transport failure ... HTTP 404".
 * The panel must name the version skew and disable the action instead.
 */
check('a matching Host shows no version warning', !texts(confirming).some((text) => text.includes('旧版本')), texts(confirming).slice(0, 4).join(' | '));

hostEndpoints = ['archivedSessions/list', 'archivedSessions/remove'];
apiCalls.length = 0;
const refreshButton = buttons(confirming).find((button) => texts(button).includes('刷新'));
refreshButton.props.onClick();
await flush();
const stale = render(main.Component, {});
const staleText = texts(stale).join(' | ');
check('a stale Host is reported as a version skew', staleText.includes('旧版本') && staleText.includes('archivedSessions/deleteSession'), staleText.slice(0, 240));
check('the stale warning names the restart remedy', staleText.includes('重新打开 DSH'), staleText.slice(0, 240));
const staleDeletes = buttons(stale).filter((button) => texts(button).includes('彻底删除'));
check('the stale action is disabled', staleDeletes.length > 0 && staleDeletes.every((button) => button.props.disabled === true), staleDeletes.map((button) => String(button.props.disabled)).join(','));
equal('the stale panel never calls delete', apiCalls.some((call) => call.startsWith('deleteSession:')), false);

/* A Host too old to report its methods gets its own wording, not a fake list. */
hostEndpoints = undefined;
const refreshAgain = buttons(stale).find((button) => texts(button).includes('刷新'));
refreshAgain.props.onClick();
await flush();
const silentText = texts(render(main.Component, {})).join(' | ');
check('a Host reporting no methods gets the unknown-build wording', silentText.includes('没有报告它暴露的方法'), silentText.slice(0, 240));
equal('the silent stale panel never calls delete', apiCalls.some((call) => call.startsWith('deleteSession:')), false);
check('the stale warning is localized in English too', (() => {
  localeLanguage = 'en';
  const english = texts(render(main.Component, {})).join(' | ');
  localeLanguage = 'zh';
  return english.includes('older build');
})(), 'English dictionary missing the stale warning');
localeLanguage = 'en';
const english = texts(render(main.Component, {})).join(' | ');
check('the page follows the locale', english.includes('Archived sessions') && english.includes('Delete permanently'), english.slice(0, 200));

const failures = results.filter((result) => !result.ok);
for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name}${result.ok ? '' : `  <- ${result.detail}`}`);
console.log(`\n${results.length - failures.length}/${results.length} checks passed`);
process.exitCode = failures.length === 0 ? 0 : 1;