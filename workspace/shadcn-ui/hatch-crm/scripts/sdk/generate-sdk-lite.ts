import { readFileSync, writeFileSync, mkdirSync } from 'fs';

type Op = { operationId?: string; parameters?: any[]; requestBody?: any; responses?: any };

function pascal(s: string) {
  return s.replace(/(^|[_\-/])(\w)/g, (_, __, c) => c.toUpperCase()).replace(/[^\w]/g, '');
}

function methodName(path: string, method: string) {
  return (method.toLowerCase() + '_' + path.replace(/[\/{}-]/g, '_')).replace(/_+/g, '_');
}

const spec = JSON.parse(readFileSync('openapi/openapi.lite.json', 'utf8'));
mkdirSync('packages/sdk-lite/src/apis', { recursive: true });
mkdirSync('packages/sdk-lite/src/types', { recursive: true });

const clientLines = [
  "export type SdkConfig = { baseUrl: string; getToken?: () => string | Promise<string> };",
  'export class HttpClient {',
  '  constructor(private cfg: SdkConfig){}',
  '  async request<T>(method:string, path:string, body?:any, query?:Record<string,any>): Promise<T> {',
  '    const url = new URL(path, this.cfg.baseUrl);',
  "    if (query) Object.entries(query).forEach(([k,v])=> v!=undefined && url.searchParams.set(k, String(v)));",
  "    const headers: Record<string,string> = { 'Content-Type':'application/json' };",
  '    const t = this.cfg.getToken ? await this.cfg.getToken() : undefined;',
  "    if (t) headers['Authorization'] = `Bearer ${t}`;",
  '    const res = await fetch(url.toString(), { method, headers, body: body?JSON.stringify(body):undefined });',
  '    if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);',
  '    return (await res.json()) as T;',
  '  }',
  '}'
];

writeFileSync('packages/sdk-lite/src/client.ts', clientLines.join('\n'));

const tags: Record<string, { name: string; ops: { path: string; method: string; op: Op }[] }> = {};
for (const path of Object.keys(spec.paths || {})) {
  const methods = spec.paths[path];
  for (const method of Object.keys(methods)) {
    const op: Op = methods[method];
    const tag = (op as any).tags?.[0] || 'Default';
    tags[tag] ||= { name: tag, ops: [] };
    tags[tag].ops.push({ path, method, op });
  }
}

for (const tag of Object.values(tags)) {
  const cls = pascal(tag.name) + 'Api';
  const lines = [
    `import { HttpClient } from '../client';`,
    `export class ${cls} {`,
    `  constructor(private http: HttpClient){}`
  ];
  for (const { path, method } of tag.ops) {
    const mname = methodName(path, method);
    const argList = `args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}`;
    lines.push(
      `  async ${mname}(${argList}) {`,
      `    let p = '${path.replace(/'/g, "\\'")}';`,
      `    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));`,
      `    return this.http.request('${method.toUpperCase()}', p, args.body, args.query);`,
      `  }`
    );
  }
  lines.push('}');
  writeFileSync(`packages/sdk-lite/src/apis/${cls}.ts`, lines.join('\n'));
}

const indexTemplate = `
export * from './client';
${Object.values(tags)
  .map((t) => `export * from './apis/${pascal(t.name)}Api';`)
  .join('\n')}
`;

writeFileSync('packages/sdk-lite/src/index.ts', indexTemplate.trimStart());
