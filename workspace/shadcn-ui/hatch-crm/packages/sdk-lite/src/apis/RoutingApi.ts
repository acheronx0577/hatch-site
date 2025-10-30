import { HttpClient } from '../client';
export class RoutingApi {
  constructor(private http: HttpClient){}
  async get_routing_rules(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/routing/rules';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('GET', p, args.body, args.query);
  }
  async post_routing_rules(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/routing/rules';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
  async patch_routing_rules_id_(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/routing/rules/{id}';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('PATCH', p, args.body, args.query);
  }
  async delete_routing_rules_id_(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/routing/rules/{id}';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('DELETE', p, args.body, args.query);
  }
  async get_routing_capacity(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/routing/capacity';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('GET', p, args.body, args.query);
  }
  async get_routing_events(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/routing/events';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('GET', p, args.body, args.query);
  }
  async get_routing_sla(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/routing/sla';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('GET', p, args.body, args.query);
  }
  async post_routing_sla_process(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/routing/sla/process';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
  async get_routing_metrics(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/routing/metrics';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('GET', p, args.body, args.query);
  }
}