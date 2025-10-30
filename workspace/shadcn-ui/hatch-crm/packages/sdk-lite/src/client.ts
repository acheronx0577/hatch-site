export type SdkConfig = { baseUrl: string; getToken?: () => string | Promise<string> };
export class HttpClient {
  constructor(private cfg: SdkConfig){}
  async request<T>(method:string, path:string, body?:any, query?:Record<string,any>): Promise<T> {
    const url = new URL(path, this.cfg.baseUrl);
    if (query) Object.entries(query).forEach(([k,v])=> v!=undefined && url.searchParams.set(k, String(v)));
    const headers: Record<string,string> = { 'Content-Type':'application/json' };
    const t = this.cfg.getToken ? await this.cfg.getToken() : undefined;
    if (t) headers['Authorization'] = `Bearer ${t}`;
    const res = await fetch(url.toString(), { method, headers, body: body?JSON.stringify(body):undefined });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  }
}