import { HttpClient } from '../client';
export class DashboardsApi {
  constructor(private http: HttpClient){}
  async get_dashboards_broker(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/dashboards/broker';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('GET', p, args.body, args.query);
  }
}