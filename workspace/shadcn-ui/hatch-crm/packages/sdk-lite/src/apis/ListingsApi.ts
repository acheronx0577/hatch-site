import { HttpClient } from '../client';
export class ListingsApi {
  constructor(private http: HttpClient){}
  async get_listings(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/listings';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('GET', p, args.body, args.query);
  }
  async get_properties(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/properties';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('GET', p, args.body, args.query);
  }
  async post_listings_promote(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/listings/promote';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
  async post_properties_promote(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/properties/promote';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
}