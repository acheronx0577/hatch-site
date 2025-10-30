import { HttpClient } from '../client';
export class CommissionPlansApi {
  constructor(private http: HttpClient){}
  async get_commission_plans(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/commission-plans';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('GET', p, args.body, args.query);
  }
  async post_commission_plans(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/commission-plans';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
  async get_commission_plans_id_(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/commission-plans/{id}';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('GET', p, args.body, args.query);
  }
  async patch_commission_plans_id_(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/commission-plans/{id}';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('PATCH', p, args.body, args.query);
  }
}