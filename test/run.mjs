/**
 * Functional verification for the archived-sessions Host plugin.
 *
 * Builds a synthetic DSH home, a stub Cordis context, and the faithful
 * protocol stand-in, then exercises the real plugin module: Remote markers,
 * source-mode parameter parsing, the archived listing, and every deletion
 * guard and outcome.
 */
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = join(here, '..');
const home = join(here, 'tmp', 'home');
const pluginPath = join(root, 'index.js');

/* Every fixture lives under test/tmp so a run never touches a real DSH home. */
await fs.rm(join(here, 'tmp'), { recursive: true, force: true });

const results = [];
/** Cordis service key the plugin must register under. */
const SERVICE_KEY_FOR_TEST = 'archivedSessions';
function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail });
}
function equal(name, actual, expected) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/** Gateway source-mode parameter parsing, copied verbatim from dsh-api-gateway. */
function methodParameterNames(service, method) {
  let prototype = Object.getPrototypeOf(service);
  let implementation;
  while (prototype !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, method);
    if (descriptor !== undefined) {
      if ('value' in descriptor && typeof descriptor.value === 'function') implementation = descriptor.value;
      break;
    }
    prototype = Object.getPrototypeOf(prototype);
  }
  const source = Function.prototype.toString.call(implementation);
  const open = source.indexOf('(');
  const close = source.indexOf(')', open + 1);
  const body = source.slice(open + 1, close).trim();
  if (body.length === 0) return [];
  return body.split(',').map((part) => part.trim());
}

async function writeJson(path, value) {
  await fs.mkdir(join(path, '..'), { recursive: true });
  await fs.writeFile(path, JSON.stringify(value, null, 2), 'utf8');
}

async function makeSession(workspaceKey, sessionId, { bytes = 0, title = null, cwd = null, createdAt = 1_700_000_000_000, lastPromptAt = null, cache = true } = {}) {
  const dir = join(home, 'sessions', workspaceKey, sessionId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(join(dir, 'session.v4.jsonl.zstd'), Buffer.alloc(bytes, 7));
  if (cache) {
    await writeJson(join(home, 'storages', 'session_projcache', 'sessions', `${sessionId}.json`), {
      version: 7,
      record: {
        identity: { formatVersion: 4, createdAt, cwd },
        rows: {
          title: { ver: 1, seq: 3, val: title },
          sessionListMetadata: { ver: 1, seq: 3, val: { blank: false, lastPromptAt } },
        },
      },
    });
  }
  return dir;
}

await fs.rm(home, { recursive: true, force: true });
process.env.DSH_HOME = home;

const archivedIds = new Set([
  'session-aaaa-archived',
  'session-dddd-archived-nocache',
  'session-cccc-live',
]);
const unarchived = [];
const workspaceKey = '--C-Users-test-project--';
const now = Date.now();

const archivedDir = await makeSession(workspaceKey, 'session-aaaa-archived', {
  bytes: 1016, title: 'Alpha 会话标题', cwd: 'C:\\Users\\test\\project', lastPromptAt: now - 3000,
});
await makeSession(workspaceKey, 'session-dddd-archived-nocache', { bytes: 64, cache: false });
const liveDir = await makeSession(workspaceKey, 'session-cccc-live', { bytes: 8, title: 'Live', cwd: 'C:\\Users\\test\\project', lastPromptAt: now - 1000 });
await makeSession(workspaceKey, 'session-bbbb-not-archived', { bytes: 16, title: 'Not archived', cwd: 'C:\\x' });

await writeJson(join(home, 'storages', 'workspace.json'), {
  unit: { name: 'workspace', version: 2 },
  global: { initialized: true, workspaceIds: ['ws-1'], archivedSessionIds: [...archivedIds], pinnedSessionIds: [], defaultWorkspaceId: 'ws-1' },
  tables: {
    workspaces: {
      'ws-1': {
        path: 'C:\\Users\\test\\project',
        title: 'project',
        sessionIds: ['session-aaaa-archived', 'session-dddd-archived-nocache', 'session-cccc-live', 'session-bbbb-not-archived'],
      },
    },
  },
});

const liveSession = { id: 'session-cccc-live' };
const log = [];
const calls = [];
const workspaceRecord = {
  path: 'C:\\Users\\test\\project',
  sessionIds: ['session-aaaa-archived', 'session-dddd-archived-nocache', 'session-cccc-live', 'session-bbbb-not-archived'],
  async detachSession(sessionId) {
    calls.push(`detach:${sessionId}`);
    workspaceRecord.sessionIds = workspaceRecord.sessionIds.filter((id) => id !== sessionId);
    log.push(`detach:${sessionId}`);
  },
};
const provided = {};
const reflectProps = {};
const ctx = {
  provide(name, value) {
    provided[name] = value;
    reflectProps[name] ??= { type: 'service' };
  },
  get(name) {
    if (name in provided) return provided[name];
    if (name === 'workspaceRegistry') {
      return {
        get archivedSessionIds() {
          return [...archivedIds];
        },
        async stopSessionActivity(id) {
          calls.push(`stop:${id}`);
        },
        list: () => [workspaceRecord],
        async unarchiveSession(id) {
          calls.push(`unarchive:${id}`);
          archivedIds.delete(String(id));
          unarchived.push(String(id));
          log.push(`unarchive:${id}`);
        },
      };
    }
    if (name === 'sessions') return { get: (id) => (id === liveSession.id ? liveSession : undefined) };
    if (name === 'agents') return { get: () => undefined };
    if (name === 'storageDomain') {
      return {
        get: (domain) => (domain === 'session_projcache'
          ? {
              table: (table) => (table === 'sessions'
                ? {
                    async delete(id) {
                      calls.push(`cache-delete:${id}`);
                    },
                  }
                : undefined),
            }
          : undefined),
      };
    }
    return undefined;
  },
  emit(event, payload) {
    calls.push(`emit:${event}:${payload}`);
  },
  logger: { info: (message) => log.push(`info:${message}`), warn: (m) => log.push(`warn:${m}`), error: (m) => log.push(`error:${m}`) },
};

const module = await import(pathToFileURL(pluginPath).href);
const ArchivedSessions = module.default;
const service = new ArchivedSessions(ctx, {});

/*
 * Gateway-side binding validation, copied from dsh-api-gateway so the service
 * is checked against the exact contract the Host enforces before dispatch.
 */
const isObject = (value) => typeof value === 'object' && value !== null;
const originalOf = (receiver) => {
  const original = Reflect.get(receiver, Symbol.for('cordis.original'));
  return isObject(original) ? original : receiver;
};
function readBinding(value, original, serviceKey, endpoint, namespace) {
  if (!isObject(value) || Reflect.get(value, 'service') !== original || Reflect.get(value, 'serviceKey') !== serviceKey
    || typeof Reflect.get(value, 'namespace') !== 'string'
    || (namespace !== undefined && Reflect.get(value, 'namespace') !== namespace)) {
    throw new Error(`inconsistent typertRemote binding for ${endpoint}`);
  }
  return value;
}

check('the plugin registers itself as a Cordis service', reflectProps[SERVICE_KEY_FOR_TEST]?.type === 'service', JSON.stringify(reflectProps));
check('the service value is reachable through the context', ctx.get(SERVICE_KEY_FOR_TEST) === service);
try {
  const receiver = ctx.get(SERVICE_KEY_FOR_TEST);
  const original = originalOf(receiver);
  readBinding(Reflect.get(original, 'typertRemote'), original, SERVICE_KEY_FOR_TEST, 'archivedSessions/deleteSession', SERVICE_KEY_FOR_TEST);
  check('the gateway validates the Remote binding', true);
} catch (error) {
  check('the gateway validates the Remote binding', false, String(error.message));
}

try {

const { remoteMethods } = await import('./stubs/dsh-typert-protocol.mjs');

equal('Remote markers are readable', remoteMethods(service).map((marker) => marker.method), ['list', 'deleteSession']);
check('Remote markers are direct invocations', remoteMethods(service).every((marker) => marker.invocation.kind === 'direct'));
check('typertRemote binding names the namespace', service.typertRemote?.namespace === 'archivedSessions', String(service.typertRemote?.namespace));
check('typertRemote binding points back at the service', service.typertRemote?.service === service && service.typertRemote?.serviceKey === 'archivedSessions');
equal('list() has no business parameters', methodParameterNames(service, 'list'), []);
equal('deleteSession() parameters parse for source mode', methodParameterNames(service, 'deleteSession'), ['sessionId', 'signal']);

const listed = await service.list();
const byId = new Map(listed.sessions.map((session) => [session.sessionId, session]));
equal('list() reports the archived set only', [...byId.keys()].sort(), ['session-aaaa-archived', 'session-cccc-live', 'session-dddd-archived-nocache']);
check('list() exposes home', listed.home === home, listed.home);
equal('list() reports the endpoints this build exposes', listed.endpoints, ['archivedSessions/list', 'archivedSessions/deleteSession']);
const alpha = byId.get('session-aaaa-archived');
check('title comes from the projection cache', alpha.title === 'Alpha 会话标题', String(alpha.title));
check('cwd comes from the projection cache', alpha.cwd === 'C:\\Users\\test\\project', String(alpha.cwd));
check('byte size is summed from disk', alpha.bytes === 1016, String(alpha.bytes));
check('on-disk sessions are marked', alpha.onDisk === true && alpha.directory === archivedDir, String(alpha.directory));
const delta = byId.get('session-dddd-archived-nocache');
check('cwd falls back to the workspace path', delta.cwd === 'C:\\Users\\test\\project', String(delta.cwd));
check('a missing projection cache keeps the session listed', delta.title === null && delta.bytes === 64, JSON.stringify(delta));
check(
  'newest activity sorts first among timestamped sessions',
  listed.sessions.findIndex((session) => session.sessionId === 'session-cccc-live')
    < listed.sessions.findIndex((session) => session.sessionId === 'session-aaaa-archived'),
  listed.sessions.map((session) => session.sessionId).join(','),
);
check(
  'the least recently active session sorts last',
  listed.sessions[listed.sessions.length - 1].sessionId === 'session-aaaa-archived',
  listed.sessions.map((session) => session.sessionId).join(','),
);

async function expectThrow(name, run, fragment) {
  try {
    await run();
    check(name, false, 'no error was thrown');
  } catch (error) {
    check(name, String(error.message).includes(fragment), `message was ${JSON.stringify(error.message)}`);
  }
}

await expectThrow('deleteSession() refuses an unarchived session', () => service.deleteSession('session-bbbb-not-archived'), 'not archived');
await expectThrow('deleteSession() refuses a live session', () => service.deleteSession('session-cccc-live'), 'still open');
await expectThrow('deleteSession() rejects an empty id', () => service.deleteSession(''), 'session id is required');
check('guarded removals left the archive set alone', !unarchived.includes('session-bbbb-not-archived') && !unarchived.includes('session-cccc-live'));
check('guarded removals left the files alone', await fs.stat(join(home, 'sessions', workspaceKey, 'session-cccc-live')).then(() => true, () => false));

const removed = await service.deleteSession('session-aaaa-archived');
equal('deleteSession() reports both artifacts', removed, { sessionId: 'session-aaaa-archived', directory: true, cache: true });
check('session directory is gone from disk', await fs.stat(archivedDir).then(() => false, () => true));
check('projection cache file is gone from disk', await fs
  .stat(join(home, 'storages', 'session_projcache', 'sessions', 'session-aaaa-archived.json'))
  .then(() => false, () => true));
check('archive membership was dropped durably', unarchived.includes('session-aaaa-archived'), unarchived.join(','));
check('an unrelated session file survives', await fs.stat(join(home, 'sessions', workspaceKey, 'session-bbbb-not-archived')).then(() => true, () => false));
check('live session file survives', await fs.stat(liveDir).then(() => true, () => false));
check('activity is stopped before the archive membership drops',
  calls.indexOf('stop:session-aaaa-archived') !== -1
  && calls.indexOf('stop:session-aaaa-archived') < calls.indexOf('unarchive:session-aaaa-archived'),
  calls.join(','));
check('the owning workspace detached the session', calls.includes('detach:session-aaaa-archived') && !workspaceRecord.sessionIds.includes('session-aaaa-archived'), calls.join(','));
check('the projection cache storage domain deleted the record', calls.includes('cache-delete:session-aaaa-archived'), calls.join(','));
check('an explicit removal notice reaches clients', calls.includes('emit:api-session/removed:session-aaaa-archived'), calls.join(','));
check('guarded removals never stopped activity', !calls.includes('stop:session-cccc-live') && !calls.includes('stop:session-bbbb-not-archived'), calls.join(','));
check('guarded removals never detached their workspace', !calls.some((call) => call.startsWith('detach:session-c') || call.startsWith('detach:session-b')), calls.join(','));
check('the removal notice follows the actual deletion',
  calls.indexOf('emit:api-session/removed:session-aaaa-archived') > calls.indexOf('cache-delete:session-aaaa-archived'),
  calls.join(','));

const after = await service.list();
check('the deleted session is no longer listed', !after.sessions.some((session) => session.sessionId === 'session-aaaa-archived'), after.sessions.map((s) => s.sessionId).join(','));

const nocache = await service.deleteSession('session-dddd-archived-nocache');
equal('deleteSession() handles a session without a projection cache', nocache, { sessionId: 'session-dddd-archived-nocache', directory: true, cache: false });

archivedIds.add('session-eeee-orphaned-record');
const orphaned = await service.deleteSession('session-eeee-orphaned-record');
equal('deleteSession() still clears an archived record whose files are gone', orphaned, { sessionId: 'session-eeee-orphaned-record', directory: false, cache: false });
check('an orphaned archived record is still released and announced',
  calls.includes('unarchive:session-eeee-orphaned-record') && calls.includes('emit:api-session/removed:session-eeee-orphaned-record'),
  calls.join(','));

} catch (error) {
  check('verification ran to completion', false, String((error && error.stack) || error));
}

const failures = results.filter((result) => !result.ok);
for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name}${result.ok ? '' : `  <- ${result.detail}`}`);
console.log(`\n${results.length - failures.length}/${results.length} checks passed`);
process.exitCode = failures.length === 0 ? 0 : 1;