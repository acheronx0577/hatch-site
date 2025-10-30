import { HttpClient } from '../client';
export class DealDeskApi {
  constructor(private http: HttpClient){}
  async post_deal_desk_requests(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/deal-desk/requests';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
  async get_deal_desk_requests(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/deal-desk/requests';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('GET', p, args.body, args.query);
  }
  async post_deal_desk_requests_id_approve(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/deal-desk/requests/{id}/approve';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
  async post_deal_desk_requests_id_reject(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/deal-desk/requests/{id}/reject';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
}