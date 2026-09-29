/**
 * Verification stand-in for @deepseek-ai/dsh-typert-protocol.
 *
 * `remoteMethods` and the descriptor reader are copied verbatim from the
 * shipped implementation so the plugin's hand-written marker descriptor is
 * validated exactly as the Host Gateway would read it. `TypertRemoteService`
 * keeps the observable contract (Cordis service key plus the visible
 * `typertRemote` binding) without pulling in the Cordis runtime.
 *
 * Derived from @deepseek-ai/dsh-typert-protocol 0.2.0-rc.1 (MIT, (c) 2026
 * DeepSeek); see ../NOTICE.md.
 */
const REMOTE_METHOD_DESCRIPTOR = '@deepseek-ai/dsh-typert-protocol/remote-methods';

function readRemoteMethodDescriptor(prototype) {
  const property = Object.getOwnPropertyDescriptor(prototype, REMOTE_METHOD_DESCRIPTOR);
  if (property === undefined) return undefined;
  const descriptor = property.value;
  if (descriptor === null || typeof descriptor !== 'object') {
    throw new TypeError('typert-protocol: Remote method descriptor must be an object');
  }
  const version = Reflect.get(descriptor, 'version');
  if (version !== 1) throw new TypeError(`typert-protocol: unsupported Remote method descriptor version ${String(version)}`);
  const methods = Reflect.get(descriptor, 'methods');
  if (!Array.isArray(methods)) throw new TypeError('typert-protocol: Remote method descriptor methods must be an array');
  return descriptor;
}

export function remoteMethods(service) {
  const prototype = Object.getPrototypeOf(service);
  if (prototype === null) return [];
  return (readRemoteMethodDescriptor(prototype)?.methods ?? []).map((marker) => ({ ...marker }));
}

export class TypertRemoteService {
  constructor(ctx, serviceKey) {
    this.ctx = ctx;
    this.name = serviceKey;
    this.typertRemote = Object.freeze({ service: this, serviceKey, namespace: serviceKey });
  }
}

export { REMOTE_METHOD_DESCRIPTOR };