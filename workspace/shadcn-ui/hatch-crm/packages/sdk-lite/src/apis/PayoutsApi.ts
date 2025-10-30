import { HttpClient } from '../client';
export class PayoutsApi {
  constructor(private http: HttpClient){}
  async get_payouts(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/payouts';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('GET', p, args.body, args.query);
  }
  async post_payouts_generate(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/payouts/generate';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
  async post_payouts_id_mark_paid(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/payouts/{id}/mark-paid';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
}