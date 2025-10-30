import { HttpClient } from '../client';
export class RETransactionsApi {
  constructor(private http: HttpClient){}
  async get_re_transactions_id_(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/re/transactions/{id}';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('GET', p, args.body, args.query);
  }
  async patch_re_transactions_id_milestone(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/re/transactions/{id}/milestone';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('PATCH', p, args.body, args.query);
  }
  async get_re_transactions_id_commission(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/re/transactions/{id}/commission';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('GET', p, args.body, args.query);
  }
  async post_re_transactions_id_payouts(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/re/transactions/{id}/payouts';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
}