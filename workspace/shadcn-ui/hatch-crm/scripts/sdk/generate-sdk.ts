// AUTO-GENERATED UTILITY (manual execution)
import { promises as fs } from 'fs';
import path from 'path';

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'options' | 'head';

type SchemaObject = Record<string, unknown>;

type ComponentsObject = {
  schemas?: Record<string, SchemaObject>;
};

type ParameterObject = {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  schema?: SchemaObject;
  description?: string;
};

type RequestBodyObject = {
  required?: boolean;
  content?: Record<string, { schema?: SchemaObject }>;
};

type ResponseObject = {
  description?: string;
  content?: Record<string, { schema?: SchemaObject }>;
};

type OperationObject = {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: ParameterObject[];
  requestBody?: RequestBodyObject;
  responses?: Record<string, ResponseObject>;
};

type PathItemObject = {
  parameters?: ParameterObject[];
} & Partial<Record<HttpMethod, OperationObject>>;

type OpenApiDocument = {
  components?: ComponentsObject;
  paths?: Record<string, PathItemObject>;
};

const HEADER = '// AUTO-GENERATED - DO NOT EDIT\n\n';

class TypeGenerator {
  private readonly nameMap = new Map<string, string>();
  private readonly emitted = new Map<string, string>();
  private readonly processing = new Set<string>();

  constructor(private readonly schemas: Record<string, SchemaObject> = {}) {
    for (const rawName of Object.keys(schemas)) {
      this.nameMap.set(rawName, this.formatTypeName(rawName));
    }
  }

  emitAll(): string {
    const lines: string[] = [HEADER];
    const names = Object.keys(this.schemas).sort();
    for (const name of names) {
      const declaration = this.emitSchema(name);
      if (declaration) {
        lines.push(declaration.trimEnd(), '');
      }
    }
    return `${lines.join('\n')}`.trimEnd() + '\n';
  }

  public resolveType(schema: SchemaObject | undefined, collector?: Set<string>): string {
    if (!schema) {
      return 'unknown';
    }
    if (typeof schema !== 'object') {
      return 'unknown';
    }
    if ('$ref' in schema) {
      const ref = (schema as any)['$ref'];
      if (typeof ref === 'string') {
        const refName = this.extractRefName(ref);
        const typeName = this.emitSchema(refName);
        if (collector && typeName) {
          collector.add(typeName);
        }
        return typeName ?? 'unknown';
      }
    }

    if ('oneOf' in schema && Array.isArray((schema as any).oneOf)) {
      const parts = ((schema as any).oneOf as SchemaObject[]).map((item) => this.resolveType(item, collector));
      return parts.join(' | ');
    }

    if ('anyOf' in schema && Array.isArray((schema as any).anyOf)) {
      const parts = ((schema as any).anyOf as SchemaObject[]).map((item) => this.resolveType(item, collector));
      return parts.join(' | ');
    }

    if ('allOf' in schema && Array.isArray((schema as any).allOf)) {
      const parts = ((schema as any).allOf as SchemaObject[]).map((item) => this.resolveType(item, collector));
      return parts.join(' & ');
    }

    const type = (schema as any).type as string | undefined;

    if (type === 'array') {
      const items = (schema as any).items as SchemaObject | undefined;
      return `${this.resolveType(items, collector)}[]`;
    }

    if (type === 'object' || (schema as any).properties) {
      return this.inlineObject(schema as any, collector);
    }

    if ((schema as any).enum && Array.isArray((schema as any).enum)) {
      const values = ((schema as any).enum as unknown[]).map((value) => JSON.stringify(value));
      return values.join(' | ');
    }

    if (type === 'string') {
      return 'string';
    }

    if (type === 'integer' || type === 'number') {
      return 'number';
    }

    if (type === 'boolean') {
      return 'boolean';
    }

    if ((schema as any).format === 'binary') {
      return 'Blob';
    }

    return 'unknown';
  }

  private inlineObject(schema: SchemaObject, collector?: Set<string>): string {
    const properties: Record<string, SchemaObject> = (schema as any).properties ?? {};
    const required = new Set<string>(((schema as any).required as string[]) ?? []);
    const additional = (schema as any).additionalProperties as SchemaObject | boolean | undefined;

    const lines: string[] = [];
    for (const [rawName, propSchema] of Object.entries(properties)) {
      const optional = required.has(rawName) ? '' : '?';
      const key = this.formatPropertyName(rawName);
      const description = typeof (propSchema as any).description === 'string' ? `  /** ${(propSchema as any).description} */\n` : '';
      const valueType = this.resolveType(propSchema as SchemaObject, collector);
      lines.push(`${description}  ${key}${optional}: ${valueType};`);
    }

    if (additional) {
      const additionalType = typeof additional === 'boolean' ? 'unknown' : this.resolveType(additional as SchemaObject, collector);
      lines.push(`  [key: string]: ${additionalType};`);
    }

    if (lines.length === 0) {
      return 'Record<string, unknown>';
    }

    return `{
${lines.join('\n')}
}`;
  }

  private emitSchema(rawName: string): string | undefined {
    const typeName = this.nameMap.get(rawName) ?? this.formatTypeName(rawName);
    if (this.emitted.has(typeName)) {
      return typeName;
    }
    if (this.processing.has(typeName)) {
      return typeName;
    }

    const schema = this.schemas[rawName];
    if (!schema) {
      this.emitted.set(typeName, `export type ${typeName} = unknown;\n`);
      return typeName;
    }

    this.processing.add(typeName);
    const declaration = this.createDeclaration(typeName, schema as SchemaObject);
    this.processing.delete(typeName);
    this.emitted.set(typeName, declaration);
    return typeName;
  }

  private createDeclaration(typeName: string, schema: SchemaObject): string {
    if ((schema as any).enum && Array.isArray((schema as any).enum)) {
      const values = ((schema as any).enum as unknown[]).map((value) => JSON.stringify(value));
      return `export type ${typeName} = ${values.join(' | ')};\n`;
    }

    const type = (schema as any).type as string | undefined;

    if (type === 'array') {
      const items = (schema as any).items as SchemaObject | undefined;
      return `export type ${typeName} = ${this.resolveType(items)}[];\n`;
    }

    if ('allOf' in schema) {
      const parts = ((schema as any).allOf as SchemaObject[]).map((item) => this.resolveType(item));
      return `export type ${typeName} = ${parts.join(' & ')};\n`;
    }

    if ('oneOf' in schema) {
      const parts = ((schema as any).oneOf as SchemaObject[]).map((item) => this.resolveType(item));
      return `export type ${typeName} = ${parts.join(' | ')};\n`;
    }

    if ('anyOf' in schema) {
      const parts = ((schema as any).anyOf as SchemaObject[]).map((item) => this.resolveType(item));
      return `export type ${typeName} = ${parts.join(' | ')};\n`;
    }

    const properties: Record<string, SchemaObject> = (schema as any).properties ?? {};
    const required = new Set<string>(((schema as any).required as string[]) ?? []);
    const additional = (schema as any).additionalProperties as SchemaObject | boolean | undefined;

    const lines: string[] = [];
    for (const [rawName, propSchema] of Object.entries(properties)) {
      const optional = required.has(rawName) ? '' : '?';
      const key = this.formatPropertyName(rawName);
      const description = typeof (propSchema as any).description === 'string' ? `  /** ${(propSchema as any).description} */\n` : '';
      const valueType = this.resolveType(propSchema as SchemaObject);
      lines.push(`${description}  ${key}${optional}: ${valueType};`);
    }

    if (additional) {
      const additionalType = typeof additional === 'boolean' ? 'unknown' : this.resolveType(additional as SchemaObject);
      lines.push(`  [key: string]: ${additionalType};`);
    }

    if (lines.length === 0) {
      return `export type ${typeName} = Record<string, unknown>;\n`;
    }

    return `export interface ${typeName} {
${lines.join('\n')}
}\n`;
  }

  private extractRefName(ref: string): string {
    const match = /#\/components\/schemas\/(.+)$/.exec(ref);
    return match ? match[1] : ref;
  }

  private formatTypeName(raw: string): string {
    const cleaned = raw.replace(/[^A-Za-z0-9]+/g, ' ');
    const words = cleaned.split(' ').filter(Boolean);
    const capitalised = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1));
    let candidate = capitalised.join('');
    if (!candidate) {
      candidate = 'Model';
    }
    if (!/^[A-Za-z_]/.test(candidate)) {
      candidate = `Model${candidate}`;
    }
    return candidate;
  }

  private formatPropertyName(raw: string): string {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw)) {
      return raw;
    }
    return `'${raw.replace(/'/g, "\\'")}'`;
  }

  getTypeName(raw: string): string {
    return this.nameMap.get(raw) ?? this.formatTypeName(raw);
  }
}

interface GeneratedApiFile {
  name: string;
  content: string;
  className: string;
}

class ApiGenerator {
  constructor(private readonly document: OpenApiDocument, private readonly typeGen: TypeGenerator) {}

  emitApis(dir: string): { files: GeneratedApiFile[]; classNames: string[] } {
    const files: GeneratedApiFile[] = [];
    const classNames: string[] = [];
    const grouped = this.groupByTag();

    for (const [tag, operations] of grouped) {
      const className = `${pascalCase(tag)}Api`;
      classNames.push(className);
      const content = this.buildApiFile(className, operations);
      files.push({ name: `${className}.ts`, content, className });
    }

    return { files, classNames };
  }

  private buildApiFile(
    className: string,
    operations: Array<{ path: string; method: HttpMethod; operation: OperationObject; pathParams: ParameterObject[] }>
  ): string {
    const imports = new Set<string>();
    const methods: string[] = [];
    const usedNames = new Map<string, number>();

    for (const item of operations) {
      methods.push(this.buildMethod(item.path, item.method, item.operation, item.pathParams, imports, usedNames));
    }

    const typeImports = Array.from(imports).sort();
    const importLines: string[] = [`import { ApiClient } from '../client';`];
    if (typeImports.length > 0) {
      importLines.push(`import { ${typeImports.join(', ')} } from '../types';`);
    }

    return `${HEADER}${importLines.join('\n')}\n\nexport class ${className} {\n  constructor(private readonly client: ApiClient) {}\n\n${methods.join('\n')}\n}\n`;
  }

  private buildMethod(
    pathTemplate: string,
    method: HttpMethod,
    operation: OperationObject,
    inheritedParams: ParameterObject[],
    imports: Set<string>,
    usedNames: Map<string, number>
  ): string {
    const summary = operation.summary ?? operation.description;
    const comment = summary ? `  /** ${summary.replace(/\n/g, ' ')} */\n` : '';

    const allParams = [...(inheritedParams ?? []), ...((operation.parameters ?? []) as ParameterObject[])];
    const pathParams = allParams.filter((param) => param.in === 'path');
    const queryParams = allParams.filter((param) => param.in === 'query');

    const paramSections: string[] = [];
    let requiresArg = false;

    if (pathParams.length > 0) {
      const entries = pathParams.map((param) => this.buildParamEntry(param, true, imports));
      paramSections.push(`path: {\n${entries.join('\n')}\n  }`);
      requiresArg = true;
    }

    if (queryParams.length > 0) {
      const entries = queryParams.map((param) => this.buildParamEntry(param, false, imports));
      paramSections.push(`query?: {\n${entries.join('\n')}\n  }`);
    }

    const bodyInfo = this.buildRequestBody(operation.requestBody, imports);
    if (bodyInfo) {
      paramSections.push(`${bodyInfo.required ? 'body' : 'body?'}: ${bodyInfo.type}`);
      requiresArg = requiresArg || bodyInfo.required;
    }

    const hasOptions = paramSections.length > 0;
    const optionsType = hasOptions ? `{\n  ${paramSections.join('\n  ')}\n}` : '';
    const returnType = this.resolveResponseType(operation.responses ?? {}, imports);
    const methodName = this.resolveMethodName(operation, method, pathTemplate, usedNames);

    const paramsSignature = hasOptions
      ? requiresArg
        ? `options: ${optionsType}`
        : `options: ${optionsType} = {}`
      : '';

    const optsDeclaration = hasOptions
      ? requiresArg
        ? '    const opts = options;\n'
        : '    const opts = options ?? ({} as any);\n'
      : '';

    const requestOptions = this.buildRequestInit(pathParams.length > 0, queryParams.length > 0, !!bodyInfo);

    const requestCall = `    return this.client.request<${returnType}>('${method.toUpperCase()}', '${pathTemplate}', ${requestOptions});`;

    return `${comment}  async ${methodName}(${paramsSignature}): Promise<${returnType}> {\n${optsDeclaration}${requestCall}\n  }`;
  }

  private buildParamEntry(param: ParameterObject, requiredForced: boolean, imports: Set<string>): string {
    const schema = param.schema as SchemaObject | undefined;
    const optional = param.required || requiredForced ? '' : '?';
    const key = /^[A-Za-z_][A-Za-z0-9_]*$/.test(param.name) ? param.name : `'${param.name.replace(/'/g, "\\'")}'`;
    const description = param.description ? `    /** ${param.description} */\n` : '';
    const type = this.typeGen.resolveType(schema, imports);
    return `${description}    ${key}${optional}: ${type};`;
  }

  private buildRequestBody(requestBody: RequestBodyObject | undefined, imports: Set<string>) {
    if (!requestBody) {
      return null;
    }
    const content = requestBody.content ?? {};
    const mediaType = this.pickFirstKey(content);
    if (!mediaType) {
      return null;
    }
    const schema = content[mediaType]?.schema;
    if (!schema) {
      return null;
    }
    const type = this.typeGen.resolveType(schema, imports);
    return { type, required: Boolean(requestBody.required) };
  }

  private resolveResponseType(responses: Record<string, ResponseObject>, imports: Set<string>): string {
    const entries = Object.entries(responses ?? {}).filter(([status]) => /^2/.test(status));
    if (entries.length === 0) {
      return 'void';
    }
    entries.sort(([a], [b]) => Number(a) - Number(b));
    for (const [, response] of entries) {
      const content = response.content ?? {};
      const mediaType = this.pickFirstKey(content);
      if (!mediaType) {
        continue;
      }
      const schema = content[mediaType]?.schema;
      if (!schema) {
        continue;
      }
      return this.typeGen.resolveType(schema, imports);
    }
    return 'void';
  }

  private resolveMethodName(
    operation: OperationObject,
    method: HttpMethod,
    pathTemplate: string,
    usedNames: Map<string, number>
  ): string {
    if (operation.operationId) {
      return this.deduplicateMethodName(camelCase(operation.operationId), usedNames);
    }
    const base = `${method.toLowerCase()} ${pathTemplate}`;
    return this.deduplicateMethodName(camelCase(base.replace(/\{[^}]+}/g, '')), usedNames);
  }

  private deduplicateMethodName(base: string, used: Map<string, number>): string {
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    if (count === 0) {
      return base;
    }
    return `${base}${count + 1}`;
  }

  private pickFirstKey<T>(obj: Record<string, T>): string | undefined {
    return Object.keys(obj)[0];
  }

  private buildRequestInit(hasPath: boolean, hasQuery: boolean, hasBody: boolean): string {
    const parts: string[] = [];
    if (hasPath) {
      parts.push('path: opts.path');
    }
    if (hasQuery) {
      parts.push('query: opts.query');
    }
    if (hasBody) {
      parts.push('body: opts.body');
    }
    if (parts.length === 0) {
      return '{}';
    }
    return `{\n      ${parts.join(',\n      ')}\n    }`;
  }

  private groupByTag(): Map<string, Array<{ path: string; method: HttpMethod; operation: OperationObject; pathParams: ParameterObject[] }>> {
    const result = new Map<string, Array<{ path: string; method: HttpMethod; operation: OperationObject; pathParams: ParameterObject[] }>>();
    const paths = this.document.paths ?? {};

    for (const [pathKey, item] of Object.entries(paths)) {
      const sharedParams = (item.parameters ?? []) as ParameterObject[];
      const methods = Object.entries(item) as Array<[string, unknown]>;
      for (const [maybeMethod, operationValue] of methods) {
        const method = maybeMethod.toLowerCase() as HttpMethod;
        if (!['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(method)) {
          continue;
        }
        const operation = operationValue as OperationObject;
        const tags = operation.tags ?? ['Default'];
        const pathParams = [...sharedParams, ...((operation.parameters ?? []) as ParameterObject[])].filter((param) => param.in === 'path');
        for (const tag of tags) {
          const bucket = result.get(tag) ?? [];
          bucket.push({ path: pathKey, method, operation, pathParams });
          result.set(tag, bucket);
        }
      }
    }

    return result;
  }
}

function pascalCase(input: string): string {
  return input
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('') || 'Default';
}

function camelCase(input: string): string {
  const pascal = pascalCase(input);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

async function cleanDir(dir: string) {
  const entries = await fs.readdir(dir).catch(() => [] as string[]);
  await Promise.all(
    entries.map((entry) => fs.rm(path.join(dir, entry), { recursive: true, force: true }))
  );
}

function buildClientFile(): string {
  return `${HEADER}export interface ApiClientOptions {\n  baseUrl: string;\n  defaultHeaders?: Record<string, string>;\n  getAuthToken?: () => string | Promise<string | undefined> | undefined;\n  fetchImpl?: typeof fetch;\n}\n\nexport interface RequestOptions {\n  path?: Record<string, unknown>;\n  query?: Record<string, unknown>;\n  body?: unknown;\n  headers?: Record<string, string>;\n}\n\nexport class ApiClient {\n  private readonly baseUrl: string;\n  private readonly defaultHeaders: Record<string, string>;\n  private readonly getAuthToken?: ApiClientOptions['getAuthToken'];\n  private readonly fetchImpl: typeof fetch;\n\n  constructor(options: ApiClientOptions) {\n    this.baseUrl = options.baseUrl.replace(/\\/+$/, '');\n    this.defaultHeaders = options.defaultHeaders ?? {};\n    this.getAuthToken = options.getAuthToken;\n    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);\n  }\n\n  async request<T>(method: string, template: string, options: RequestOptions = {}): Promise<T> {\n    const url = this.buildUrl(template, options.path, options.query);\n    const headers: Record<string, string> = { ...this.defaultHeaders, ...(options.headers ?? {}) };\n\n    if (this.getAuthToken) {\n      const token = await this.getAuthToken();\n      if (token) {\n        headers.Authorization = headers.Authorization ?? `Bearer ${token}`;\n      }\n    }\n\n    let body: unknown = options.body;
    let contentType = headers['Content-Type'] ?? headers['content-type'];

    if (body !== undefined && !(body instanceof FormData)) {
      if (!contentType) {
        contentType = 'application/json';
      }
      if (contentType.toLowerCase().includes('application/json')) {
        body = JSON.stringify(body);
      }
      headers['Content-Type'] = contentType;
    }

    const response = await this.fetchImpl(url, {
      method,
      headers,
      body: body as BodyInit | undefined
    });

    if (!response.ok) {
      const message = await this.safeRead(response);
      throw new Error(`API request failed (${response.status}): ${message}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const payload = await this.safeRead(response);
    try {
      return payload ? (JSON.parse(payload) as T) : (undefined as T);
    } catch {
      return payload as unknown as T;
    }
  }

  private buildUrl(template: string, pathParams?: Record<string, unknown>, query?: Record<string, unknown>): string {
    let resolved = template.replace(/\{([^}]+)\}/g, (_, key) => {
      if (!pathParams || pathParams[key] === undefined || pathParams[key] === null) {
        throw new Error(`Missing path parameter: ${key}`);
      }
      return encodeURIComponent(String(pathParams[key]));
    });

    if (!resolved.startsWith('/')) {
      resolved = `/${resolved}`;
    }

    const url = new URL(`${this.baseUrl}${resolved}`);

    if (query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) {
          continue;
        }
        if (Array.isArray(value)) {
          for (const entry of value) {
            params.append(key, String(entry));
          }
        } else {
          params.append(key, String(value));
        }
      }
      const queryString = params.toString();
      if (queryString) {
        url.search = queryString;
      }
    }

    return url.toString();
  }

  private async safeRead(response: Response): Promise<string> {
    const text = await response.text();
    return text ?? '';
  }
}
`;
}

function buildIndexFile(classNames: string[]): string {
  const apiExports = classNames
    .sort()
    .map((name) => `export { ${name} } from './apis/${name}';`)
    .join('\n');

  return `${HEADER}export * from './client';\nexport * from './types';\n${apiExports}\n`;
}

async function main() {
  const rootDir = path.resolve(__dirname, '../../');
  const specPath = path.join(rootDir, 'openapi/openapi.json');
  const sdkRoot = path.join(rootDir, 'packages/sdk');
  const srcRoot = path.join(sdkRoot, 'src');
  const apisDir = path.join(srcRoot, 'apis');
  const typesDir = path.join(srcRoot, 'types');

  const raw = await fs.readFile(specPath, 'utf8');
  const spec: OpenApiDocument = JSON.parse(raw);

  await fs.mkdir(apisDir, { recursive: true });
  await fs.mkdir(typesDir, { recursive: true });
  await cleanDir(apisDir);
  await cleanDir(typesDir);

  const typeGen = new TypeGenerator(spec.components?.schemas ?? {});
  const typesContent = typeGen.emitAll();
  await fs.writeFile(path.join(typesDir, 'index.ts'), typesContent);

  const apiGen = new ApiGenerator(spec, typeGen);
  const { files, classNames } = apiGen.emitApis(apisDir);
  for (const file of files) {
    await fs.writeFile(path.join(apisDir, file.name), file.content);
  }

  await fs.writeFile(path.join(srcRoot, 'client.ts'), buildClientFile());
  await fs.writeFile(path.join(srcRoot, 'index.ts'), buildIndexFile(classNames));

  console.log('SDK generated under packages/sdk/src');
}

main().catch((error) => {
  console.error('Failed to generate SDK', error);
  process.exitCode = 1;
});
