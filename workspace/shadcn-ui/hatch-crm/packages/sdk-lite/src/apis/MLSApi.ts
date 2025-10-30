import { HttpClient } from '../client';
export class MLSApi {
  constructor(private http: HttpClient){}
  async post_mls_preflight(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/mls/preflight';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
  async post_mls_clear_cooperation(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/mls/clear-cooperation';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
  async get_mls_profiles(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/mls/profiles';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('GET', p, args.body, args.query);
  }
  async get_mls_dashboard(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/mls/dashboard';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('GET', p, args.body, args.query);
  }
}