import { HttpClient } from '../client';
export class ToursApi {
  constructor(private http: HttpClient){}
  async post_tours(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/tours';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
  async post_tours_id_kept(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/tours/{id}/kept';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
}