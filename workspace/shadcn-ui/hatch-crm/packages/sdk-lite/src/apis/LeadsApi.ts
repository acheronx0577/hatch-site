import { HttpClient } from '../client';
export class LeadsApi {
  constructor(private http: HttpClient){}
  async get_v1_leads(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/v1/leads';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('GET', p, args.body, args.query);
  }
  async post_v1_leads(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/v1/leads';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
  async get_v1_leads_id_(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/v1/leads/{id}';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('GET', p, args.body, args.query);
  }
  async patch_v1_leads_id_(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/v1/leads/{id}';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('PATCH', p, args.body, args.query);
  }
  async post_v1_leads_id_notes(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/v1/leads/{id}/notes';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
  async post_v1_leads_id_tasks(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/v1/leads/{id}/tasks';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
  async post_v1_leads_id_touchpoints(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/v1/leads/{id}/touchpoints';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
  async patch_v1_leads_leadId_tasks_taskId_(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/v1/leads/{leadId}/tasks/{taskId}';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('PATCH', p, args.body, args.query);
  }
  async post_v1_leads_id_identify(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/v1/leads/{id}/identify';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
}