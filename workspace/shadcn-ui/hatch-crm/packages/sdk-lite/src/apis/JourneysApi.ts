import { HttpClient } from '../client';
export class JourneysApi {
  constructor(private http: HttpClient){}
  async post_journeys_id_simulate(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/journeys/{id}/simulate';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
}