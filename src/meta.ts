/** Static description of one API operation; generated into src/generated/operations.ts. */
export interface ParamMeta {
  name: string;
  required: boolean;
  /** JSON Schema of the parameter, with refs rewritten to `#/$defs/<Name>`. */
  schema: Record<string, unknown>;
  description?: string;
}

export interface OperationMeta {
  /** `<tag>.<operation>` */
  id: string;
  tag: string;
  name: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  summary?: string;
  deprecated?: boolean;
  pathParams: readonly ParamMeta[];
  query: readonly ParamMeta[];
  /** JSON request body schema (refs rewritten to `#/$defs/<Name>`), if the operation takes one. */
  body?: { required: boolean; schema: Record<string, unknown> };
  /** The operation accepts an Idempotency-Key header. */
  idempotent: boolean;
  /** The operation accepts `?dry_run=true`. */
  dryRun: boolean;
  /** Bearer auth required (false for public/token endpoints). */
  auth: boolean;
  response: "json" | "text" | "binary" | "none";
}
