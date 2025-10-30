import { HttpClient } from '../client';
export class REOffersApi {
  constructor(private http: HttpClient){}
  async post_re_offers(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/re/offers';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
  async get_re_offers(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/re/offers';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('GET', p, args.body, args.query);
  }
  async post_re_offers_id_decide(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/re/offers/{id}/decide';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
}