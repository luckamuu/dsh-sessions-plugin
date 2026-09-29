/**
 * Activation verification against the real framework.
 *
 * Loads the shipped Cordis runtime and Typert protocol (the exact modules the
 * Host loads) and starts the plugin the way the loader does: a class plugin,
 * constructed with the plugin context, registered through `ctx.provide`. This
 * is the contract that "failed to import" broke, so it is checked here without
 * any stand-in.
 *
 * Those packages live inside the application archive, so this suite needs a
 * readable copy of the framework: point `DSH_INSTALL` at any directory holding
 * `cordis/lib/index.js` and `dsh-typert-protocol/lib/index.js` (the
 * `@deepseek-ai` directory of an extracted Harness tree). Without one the suite
 * prints SKIP and exits 0, so it never blocks a checkout.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const pluginUrl = pathToFileURL(join(here, '..', 'index.js')).href;

/** First candidate directory that holds both framework packages. */
function resolveFramework() {
  const candidates = [
    process.env.DSH_INSTALL,
    join(here, '..', '..', 'dsh-pkgs', 'dsh', 'node_modules', '@deepseek-ai'),
    join(here, '..', '..', 'node_modules', '@deepseek-ai'),
    join(here, '..', 'node_modules', '@deepseek-ai'),
  ].filter((candidate) => typeof candidate === 'string' && candidate.length > 0);
  for (const directory of candidates) {
    const cordis = join(directory, 'cordis', 'lib', 'index.js');
    const protocol = join(directory, 'dsh-typert-protocol', 'lib', 'index.js');
    if (existsSync(cordis) && existsSync(protocol)) return { cordis, protocol };
  }
  return null;
}

const framework = resolveFramework();
if (framework === null) {
  console.log('SKIP  no readable Harness framework found; set DSH_INSTALL to its @deepseek-ai directory');
  process.exit(0);
}
const cordisUrl = pathToFileURL(framework.cordis).href;
const protocolUrl = pathToFileURL(framework.protocol).href;

const results = [];
function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail });
}

const { Context } = await import(cordisUrl);
const { remoteMethods } = await import(protocolUrl);
const plugin = (await import(pluginUrl)).default;

check('the plugin exports a class', typeof plugin === 'function' && Boolean(plugin.prototype));
check('the plugin declares its injected service', JSON.stringify(plugin.inject) === '["workspaceRegistry"]', JSON.stringify(plugin.inject));

const ctx = new Context();
ctx.provide('workspaceRegistry', {
  get archivedSessionIds() {
    return [];
  },
  list: () => [],
  async unarchiveSession() {},
  async stopSessionActivity() {},
 async detachSession() {},
});

const fiber = ctx.plugin(plugin, {});
try {
  await fiber.await();
  check('the plugin fiber activates', true);
} catch (error) {
  check('the plugin fiber activates', false, String((error && error.stack) || error));
}

check('the reflect table marks the service', ctx.reflect.props?.archivedSessions?.type === 'service', JSON.stringify(Object.keys(ctx.reflect.props ?? {})));
const service = ctx.get('archivedSessions');
check('the context resolves the service value', service !== undefined);
check('the service is the plugin instance', typeof service?.list === 'function' && typeof service?.deleteSession === 'function');

/* The gateway validates this binding before it dispatches anything. */
const original = Reflect.get(service, Symbol.for('cordis.original')) ?? service;
const binding = Reflect.get(original, 'typertRemote');
check(
  'the Remote binding satisfies the gateway contract',
  binding !== undefined
    && binding.service === original
    && binding.serviceKey === 'archivedSessions'
    && binding.namespace === 'archivedSessions',
  `${String(binding?.serviceKey)}/${String(binding?.namespace)}/self=${binding?.service === original}`,
);
check('the gateway reads both Remote markers from the live service', JSON.stringify(remoteMethods(original).map((marker) => marker.method)) === '["list","deleteSession"]', JSON.stringify(remoteMethods(original)));

/* Replicates the Host gateway's claim table: every marker of every service. */
const claims = new Set();
for (const [serviceKey, definition] of Object.entries(ctx.reflect.props ?? {})) {
  if (definition.type !== 'service') continue;
  const receiver = ctx.get(serviceKey);
  if (typeof receiver !== 'object' || receiver === null) continue;
  const target = Reflect.get(receiver, Symbol.for('cordis.original')) ?? receiver;
  const bound = Reflect.get(target, 'typertRemote');
  if (typeof bound !== 'object' || bound === null || typeof bound.namespace !== 'string') continue;
  for (const marker of remoteMethods(target)) claims.add(`${bound.namespace}/${marker.exportName ?? marker.method}`);
}
check('a fresh Host claims the list endpoint', claims.has('archivedSessions/list'), [...claims].join(','));
check('a fresh Host claims the delete endpoint', claims.has('archivedSessions/deleteSession'), [...claims].join(','));
check('a fresh Host claims nothing else', claims.size === 2, [...claims].join(','));

/* Source-mode descriptor derivation needs plain identifiers in this order. */
const names = (method) => {
  const source = Function.prototype.toString.call(original[method]);
  const body = source.slice(source.indexOf('(') + 1, source.indexOf(')')).trim();
  return body.length === 0 ? [] : body.split(',').map((part) => part.trim());
};
check('deleteSession() keeps the signal parameter last', JSON.stringify(names('deleteSession')) === '["sessionId","signal"]', JSON.stringify(names('deleteSession')));
check('list() takes no parameters', JSON.stringify(names('list')) === '[]', JSON.stringify(names('list')));

await fiber.dispose?.();

const failures = results.filter((result) => !result.ok);
for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name}${result.ok ? '' : `  <- ${result.detail}`}`);
console.log(`\n${results.length - failures.length}/${results.length} checks passed`);
process.exitCode = failures.length === 0 ? 0 : 1;