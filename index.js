/**
 * Host half of the "archived sessions" plugin.
 *
 * Lists the sessions the workspace registry reports as archived and can remove
 * a chosen one from disk for good: its session log directory, its projection
 * cache file, and its entry in the durable archive set. The Harness ships no
 * delete API, so this service owns the operation and exposes it to the browser
 * half through the Typert Remote gateway.
 *
 * @module @local/archived-sessions
 */
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Cordis service key and Typert Remote namespace of this service. */
const SERVICE_KEY = 'archivedSessions';

/**
 * Remote methods this build exposes, in the order they are marked.
 *
 * `list()` reports these, so a browser half built against a different method
 * set (typically an older Host that still runs a stale module) can say so
 * instead of failing with an opaque transport 404.
 */
const REMOTE_ENDPOINTS = ['list', 'deleteSession'];

/** Prototype property holding the Remote method markers read by the gateway. */
const REMOTE_METHOD_DESCRIPTOR = '@deepseek-ai/dsh-typert-protocol/remote-methods';

/** Home-relative directory holding one sub-directory per session. */
const SESSION_DIRS = 'sessions';

/** Home-relative directory holding one projection-cache file per session. */
const PROJECTION_CACHE_DIR = join('storages', 'session_projcache', 'sessions');

/** Home-relative durable workspace registry file. */
const WORKSPACE_REGISTRY_FILE = join('storages', 'workspace.json');

/**
 * Mark public instance methods as Typert Remote endpoints without decorator
 * syntax. This writes exactly the versioned prototype descriptor
 * `remoteMethods()` reads, which is what the gateway's source-mode discovery
 * consumes for a plain-JavaScript plugin with no generated reflection.
 * @param ctor - service class owning the prototype.
 * @param methods - public instance method names to expose.
 */
function markRemoteMethods(ctor, methods) {
  Object.defineProperty(ctor.prototype, REMOTE_METHOD_DESCRIPTOR, {
    configurable: true,
    value: Object.freeze({
      version: 1,
      methods: Object.freeze(
        methods.map((method) => Object.freeze({ method, invocation: Object.freeze({ kind: 'direct' }) })),
      ),
    }),
  });
}

/** Resolve the Harness home directory the way the shipped path helper does. */
function resolveHome() {
  const configured = process.env.DSH_HOME;
  if (typeof configured === 'string' && configured.trim().length > 0) return configured.trim();
  return join(homedir(), '.dsh');
}

/** Read one UTF-8 JSON file, returning `undefined` when it is absent or unparsable. */
async function readJsonFile(path) {
  try {
    return JSON.parse(await fs.readFile(path, 'utf8'));
  } catch {
    return undefined;
  }
}

/** Whether a path currently exists. */
async function pathExists(path) {
  return fs.access(path).then(() => true, () => false);
}

/** Total bytes and file count of a directory tree, ignoring entries that vanish meanwhile. */
async function directorySize(path) {
  let bytes = 0;
  let files = 0;
  let modifiedAt = 0;
  const pending = [path];
  while (pending.length > 0) {
    const current = pending.pop();
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const child = join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(child);
        continue;
      }
      try {
        const stats = await fs.stat(child);
        bytes += stats.size;
        files += 1;
        if (stats.mtimeMs > modifiedAt) modifiedAt = stats.mtimeMs;
      } catch {
        /* the entry disappeared between readdir and stat */
      }
    }
  }
  return { bytes, files, modifiedAt: modifiedAt === 0 ? undefined : modifiedAt };
}

/** Locate the session log directory for one id, whatever its workspace spelling is. */
async function findSessionDirectory(home, sessionId) {
  const root = join(home, SESSION_DIRS);
  let workspaces;
  try {
    workspaces = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return undefined;
  }
  for (const workspace of workspaces) {
    if (!workspace.isDirectory()) continue;
    const candidate = join(root, workspace.name, sessionId);
    try {
      const stats = await fs.stat(candidate);
      if (stats.isDirectory()) return candidate;
    } catch {
      /* not this workspace */
    }
  }
  return undefined;
}

/**
 * Durable workspace registry projection: the archived id set plus, per session
 * id, the workspace that accounts for it.
 */
async function readWorkspaceRegistry(home) {
  const document = await readJsonFile(join(home, WORKSPACE_REGISTRY_FILE));
  const global = document?.global ?? {};
  const archived = Array.isArray(global.archivedSessionIds) ? global.archivedSessionIds.map(String) : [];
  const workspaceBySession = new Map();
  const workspaces = document?.tables?.workspaces ?? {};
  for (const workspace of Object.values(workspaces)) {
    if (workspace === null || typeof workspace !== 'object') continue;
    for (const sessionId of Array.isArray(workspace.sessionIds) ? workspace.sessionIds : []) {
      workspaceBySession.set(String(sessionId), workspace);
    }
  }
  return { archived, workspaceBySession };
}

/** Archived session ids from the live registry, falling back to the durable file. */
async function archivedSessionIds(ctx, home) {
  const registry = ctx.get('workspaceRegistry');
  const live = registry?.archivedSessionIds;
  if (live !== undefined) return [...live].map(String);
  return (await readWorkspaceRegistry(home)).archived;
}

/** Human-readable metadata for one archived session, gathered from cache and disk. */
async function describeSession(home, sessionId, workspace) {
  const cache = await readJsonFile(join(home, PROJECTION_CACHE_DIR, `${sessionId}.json`));
  const record = cache?.record ?? {};
  const title = record?.rows?.title?.val;
  const identity = record?.identity ?? {};
  const lastPromptAt = record?.rows?.sessionListMetadata?.val?.lastPromptAt;
  const directory = await findSessionDirectory(home, sessionId);
  const onDisk = directory === undefined
    ? { bytes: 0, files: 0, modifiedAt: undefined }
    : await directorySize(directory);
  return {
    sessionId,
    title: typeof title === 'string' && title.length > 0 ? title : null,
    cwd: typeof identity.cwd === 'string' ? identity.cwd : (typeof workspace?.path === 'string' ? workspace.path : null),
    workspaceTitle: typeof workspace?.title === 'string' ? workspace.title : null,
    createdAt: Number.isFinite(identity.createdAt) ? identity.createdAt : null,
    lastPromptAt: Number.isFinite(lastPromptAt) ? lastPromptAt : null,
    modifiedAt: onDisk.modifiedAt ?? null,
    bytes: onDisk.bytes,
    files: onDisk.files,
    onDisk: directory !== undefined,
    directory: directory ?? null,
  };
}

/**
 * Archived-session registry and permanent-deletion service.
 *
 * Every method is exposed to the browser half through the Typert Remote
 * gateway; its argument names are read from this source by the gateway's
 * source-mode descriptor, so they stay plain identifiers.
 *
 * The service is registered through the public Context API rather than by
 * extending a framework class: a plugin installed from a directory cannot
 * import a framework package, because Node resolves a plugin's bare specifiers
 * from its own real path, outside the installation. `ctx.provide` marks the
 * entry as a service in the reflect table the gateway scans, and the binding
 * below is written in exactly the shape that gateway validates.
 */
class ArchivedSessions {
  static inject = ['workspaceRegistry'];

  /**
   * @param ctx - Host plugin context owning the service.
   * @param config - plugin configuration (unused).
   */
  constructor(ctx, config) {
    this.ctx = ctx;
    this.name = SERVICE_KEY;
    this.config = config ?? {};
    this.typertRemote = { service: this, serviceKey: SERVICE_KEY, namespace: SERVICE_KEY };
    ctx.provide(SERVICE_KEY, this);
    if (Object.getOwnPropertyDescriptor(ArchivedSessions.prototype, REMOTE_METHOD_DESCRIPTOR) === undefined) {
      ctx.logger?.warn?.('archived-sessions: Remote method markers are missing; the panel cannot reach this service');
    }
  }

  /**
   * List every archived session with the metadata the panel shows.
   * @returns `{ sessions, home, endpoints }`; `sessions` is ordered by last activity,
   * newest first, and `endpoints` names the Remote methods this build exposes.
   */
  async list() {
    const home = resolveHome();
    const archived = await archivedSessionIds(this.ctx, home);
    const { workspaceBySession } = await readWorkspaceRegistry(home);
    const sessions = await Promise.all(
      archived.map((sessionId) => describeSession(home, sessionId, workspaceBySession.get(sessionId))),
    );
    sessions.sort((left, right) => (right.lastPromptAt ?? right.modifiedAt ?? right.createdAt ?? 0)
      - (left.lastPromptAt ?? left.modifiedAt ?? left.createdAt ?? 0));
    return { home, endpoints: REMOTE_ENDPOINTS.map((method) => `${SERVICE_KEY}/${method}`), sessions };
  }

  /**
   * Permanently delete one archived session: its log directory, its projection
   * cache file, and its membership in the durable archive set.
   * @param sessionId - archived session to remove.
   * @param signal - cancellation supplied by the Remote carrier.
   * @returns what was removed.
   * @throws RemoteError `archived-sessions/not-archived` when the id is not archived,
   * `archived-sessions/active` when a turn is still running and must be stopped first.
   */
  async deleteSession(sessionId, signal) {
    const id = String(sessionId ?? '');
    if (id.length === 0) throw new Error('archived-sessions: a session id is required');
    const home = resolveHome();
    const archived = await archivedSessionIds(this.ctx, home);
    if (!archived.includes(id)) {
      throw new Error(`archived-sessions: ${id} is not archived; refusing to delete it from disk`);
    }
    /*
     * Membership in the in-memory session store only means the session is
     * attached — open in the UI, or held by an idle agent. That is not a reason
     * to refuse. What makes deletion unsafe is a turn actually running, because
     * its writer would put the log back after the directory is gone.
     */
    const agent = this.ctx.get('agents')?.get?.(id);
    if (agent?.status === 'running') {
      throw new Error(`archived-sessions: ${id} is running; stop its turn before deleting it from disk`);
    }
    signal?.throwIfAborted?.();

    const directory = await findSessionDirectory(home, id);
    const cacheFile = join(home, PROJECTION_CACHE_DIR, `${id}.json`);
    const hadCache = await pathExists(cacheFile);

    const registry = this.ctx.get('workspaceRegistry');
    // Stop whatever the session could still be doing before its files go away.
    await registry?.stopSessionActivity?.(id);
    // Drop the archive membership next: a half-finished delete must not leave
    // an id that the registry advertises but no reader can open.
    await registry?.unarchiveSession?.(id);
    // Release the owning workspace's accounting so no empty row survives it.
    for (const workspace of registry?.list?.() ?? []) {
      if (workspace?.sessionIds?.includes?.(id) === true) await workspace.detachSession?.(id);
    }
    /*
     * Then drop the in-memory session the way its owning fiber would: an
     * attached session keeps a persistence writer alive, and that writer would
     * recreate the log directory we are about to remove. `detachEntered` is
     * idempotent and emits the paired `session/disposed` notification.
     */
    const store = this.ctx.get('sessions');
    const attached = store?.get?.(id);
    if (attached !== undefined) {
      try {
        const entry = store?.liveEntryFor?.(attached);
        if (entry !== undefined) store?.detachEntered?.(entry);
      } catch (error) {
        this.ctx.logger?.warn?.(`archived-sessions: could not detach session ${id} from the session store: ${String(error)}`);
      }
    }

    // Prefer the projection cache's own storage domain: it keeps the in-memory
    // table and the record file consistent, where a bare unlink leaves a stale
    // row until the next restart.
    const cacheTable = this.ctx.get('storageDomain')?.get?.('session_projcache')?.table?.('sessions');
    if (typeof cacheTable?.delete === 'function') {
      try {
        await cacheTable.delete(id);
      } catch (error) {
        this.ctx.logger?.warn?.(`archived-sessions: projection cache removal failed for ${id}: ${String(error)}`);
      }
    }

    const removed = { directory: false, cache: hadCache };
    if (directory !== undefined) {
      // The whole directory, not just the current log file: earlier session-log
      // generations may sit beside it, and a reader would resurrect the session
      // from those.
      await fs.rm(directory, { recursive: true, force: true });
      removed.directory = true;
    }
    await fs.rm(cacheFile, { force: true });
    // Only an explicit notice drops the sidebar row; the archive-set change
    // alone does not remove it.
    this.ctx.emit?.('api-session/removed', id);
    this.ctx.logger?.info?.(`archived-sessions: deleted session ${id} from disk`);
    return { sessionId: id, ...removed };
  }
}

markRemoteMethods(ArchivedSessions, REMOTE_ENDPOINTS);

export { ArchivedSessions, SERVICE_KEY };
export default ArchivedSessions;