import { HttpClient } from '../client';
export class ReportingApi {
  constructor(private http: HttpClient){}
  async get_reporting_metrics(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/reporting/metrics';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('GET', p, args.body, args.query);
  }
  async post_reporting_recompute(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/reporting/recompute';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
}