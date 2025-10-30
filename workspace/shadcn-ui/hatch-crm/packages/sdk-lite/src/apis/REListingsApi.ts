import { HttpClient } from '../client';
export class REListingsApi {
  constructor(private http: HttpClient){}
  async get_re_listings_id_(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/re/listings/{id}';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('GET', p, args.body, args.query);
  }
  async post_re_listings_id_status(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/re/listings/{id}/status';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
}