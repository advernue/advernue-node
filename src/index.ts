import { createCall, type Call, type CallOptions, type ClientOptions } from "./runtime.js";
import { operations } from "./generated/operations.js";
import { buildNamespaces, type Namespaces } from "./generated/client.js";

export class Advernue {
  /** Low-level escape hatch: invoke any operation by id (`campaigns.list`) with merged path+query params. */
  readonly call: (operationId: string, params?: object, body?: unknown, opts?: CallOptions) => Promise<unknown>;

  constructor(options: ClientOptions = {}) {
    const call: Call = createCall(options);
    this.call = (id, params, body, opts) => {
      const meta = operations[id];
      if (!meta) throw new Error(`Unknown operation "${id}"`);
      return call(meta, params, body, opts);
    };
    Object.assign(this, buildNamespaces(call));
  }
}
export interface Advernue extends Namespaces {}

export { AdvernueError, DEFAULT_BASE_URL } from "./runtime.js";
export type { ClientOptions, RequestOptions, WriteOptions, DryRunOptions, CallOptions } from "./runtime.js";
export { money, fromMajor, toMajor } from "./money.js";
export type { OperationMeta, ParamMeta } from "./meta.js";
export { operations, componentSchemas } from "./generated/operations.js";
export * from "./generated/types.js";
