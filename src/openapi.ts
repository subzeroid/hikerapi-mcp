import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface Parameter {
  name: string;
  in: "query" | "path" | "header" | "cookie";
  required?: boolean;
  description?: string;
  schema?: Record<string, unknown>;
}

export interface Operation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: ParameterOrRef[];
  deprecated?: boolean;
}

export interface PathItem {
  parameters?: ParameterOrRef[];
  get?: Operation;
  post?: Operation;
  put?: Operation;
  patch?: Operation;
  delete?: Operation;
  options?: Operation;
  head?: Operation;
  [method: string]: unknown;
}

export type ParameterOrRef = Parameter | { $ref: string };

export interface OpenApiSpec {
  paths: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, unknown>;
    parameters?: Record<string, Parameter>;
  };
}

export interface ToolEntry {
  tool: Tool;
  method: string;
  path: string;
  parameters: Parameter[];
}

export interface BuildOptions {
  includeTags?: string[];
  excludeTags?: Set<string>;
}

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "options", "head"]);

export function sanitizeName(method: string, path: string): string {
  const raw = `${method}_${path}`
    .replace(/^\/+/, "")
    .replace(/\{([^}]+)\}/g, "$1")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return raw.slice(0, 128) || "tool";
}

export function resolveRef(ref: string, spec: OpenApiSpec): unknown {
  if (!ref.startsWith("#/")) return {};
  const parts = ref.slice(2).split("/");
  let node: unknown = spec;
  for (const part of parts) {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return {};
    }
  }
  return node ?? {};
}

export function expandSchema(schema: unknown, spec: OpenApiSpec, seen = new Set<string>()): unknown {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) {
    return schema.map((v) => expandSchema(v, spec, seen));
  }
  const obj = schema as Record<string, unknown>;
  if (typeof obj.$ref === "string") {
    const ref = obj.$ref;
    if (seen.has(ref)) return {};
    const next = new Set(seen);
    next.add(ref);
    return expandSchema(resolveRef(ref, spec), spec, next);
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    out[key] = expandSchema(value, spec, seen);
  }
  return out;
}

export function resolveParameter(param: ParameterOrRef, spec: OpenApiSpec): Parameter | null {
  if ("$ref" in param && typeof param.$ref === "string") {
    const resolved = resolveRef(param.$ref, spec);
    if (resolved && typeof resolved === "object" && "name" in resolved && "in" in resolved) {
      return resolved as Parameter;
    }
    return null;
  }
  return param as Parameter;
}

export function mergeParameters(
  pathParams: ParameterOrRef[] | undefined,
  opParams: ParameterOrRef[] | undefined,
  spec: OpenApiSpec,
): Parameter[] {
  const byKey = new Map<string, Parameter>();
  for (const raw of pathParams ?? []) {
    const p = resolveParameter(raw, spec);
    if (p) byKey.set(`${p.in}:${p.name}`, p);
  }
  for (const raw of opParams ?? []) {
    const p = resolveParameter(raw, spec);
    if (p) byKey.set(`${p.in}:${p.name}`, p);
  }
  return [...byKey.values()];
}

export function buildInputSchema(parameters: Parameter[], spec: OpenApiSpec): Tool["inputSchema"] {
  const properties: Record<string, object> = {};
  const required: string[] = [];

  for (const param of parameters) {
    const schema = expandSchema(param.schema ?? { type: "string" }, spec) as Record<string, unknown>;
    if (param.description) {
      schema.description = param.description;
    }
    properties[param.name] = schema;
    if (param.required) {
      required.push(param.name);
    }
  }

  const result: Tool["inputSchema"] = { type: "object", properties };
  if (required.length > 0) {
    (result as { required: string[] }).required = required;
  }
  return result;
}

export function shouldIncludeOperation(
  op: Operation,
  includeTags: string[],
  excludeTags: Set<string>,
): boolean {
  if (op.deprecated) return false;
  const tags = op.tags ?? [];
  if (tags.some((t) => excludeTags.has(t))) return false;
  if (includeTags.length > 0) {
    return tags.some((t) => includeTags.includes(t));
  }
  return true;
}

export function buildTools(spec: OpenApiSpec, opts: BuildOptions = {}): ToolEntry[] {
  const includeTags = opts.includeTags ?? [];
  const excludeTags = opts.excludeTags ?? new Set<string>();
  const entries: ToolEntry[] = [];
  const usedNames = new Set<string>();

  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    if (!pathItem || typeof pathItem !== "object") continue;

    const pathParams = pathItem.parameters;

    for (const [method, raw] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method)) continue;
      if (method !== "get") continue;
      if (!raw || typeof raw !== "object") continue;
      const op = raw as Operation;
      if (!shouldIncludeOperation(op, includeTags, excludeTags)) continue;

      let name = sanitizeName(method, path);
      if (usedNames.has(name)) {
        let suffix = 2;
        while (usedNames.has(`${name}_${suffix}`)) suffix++;
        name = `${name}_${suffix}`;
      }
      usedNames.add(name);

      const parameters = mergeParameters(pathParams, op.parameters, spec).filter(
        (p) => p.in === "query" || p.in === "path",
      );

      const description = [op.summary, op.description]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 1024) || `${method.toUpperCase()} ${path}`;

      entries.push({
        tool: {
          name,
          description: `[${method.toUpperCase()} ${path}] ${description}`,
          inputSchema: buildInputSchema(parameters, spec),
        },
        method,
        path,
        parameters,
      });
    }
  }

  return entries;
}

export function buildUrl(
  baseUrl: string,
  pathTemplate: string,
  args: Record<string, unknown>,
  parameters: Parameter[],
): string {
  let path = pathTemplate;
  const query = new URLSearchParams();

  for (const param of parameters) {
    const value = args[param.name];
    if (value === undefined || value === null) continue;

    if (param.in === "path") {
      path = path.replace(`{${param.name}}`, encodeURIComponent(String(value)));
    } else if (param.in === "query") {
      if (Array.isArray(value)) {
        for (const v of value) query.append(param.name, String(v));
      } else {
        query.append(param.name, String(value));
      }
    }
  }

  const qs = query.toString();
  return `${baseUrl}${path}${qs ? `?${qs}` : ""}`;
}

export const TRUSTED_HOSTS = new Set(["api.hikerapi.com", "api.instagrapi.com"]);

export function isTrustedUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return TRUSTED_HOSTS.has(host);
  } catch {
    return false;
  }
}
