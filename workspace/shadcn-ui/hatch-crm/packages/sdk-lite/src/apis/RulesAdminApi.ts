import { HttpClient } from '../client';
export class RulesAdminApi {
  constructor(private http: HttpClient){}
  async get_admin_rules_validation(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/admin/rules/validation';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('GET', p, args.body, args.query);
  }
  async post_admin_rules_validation(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/admin/rules/validation';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
  async patch_admin_rules_validation_id_(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/admin/rules/validation/{id}';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('PATCH', p, args.body, args.query);
  }
  async delete_admin_rules_validation_id_(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/admin/rules/validation/{id}';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('DELETE', p, args.body, args.query);
  }
  async get_admin_rules_assignment(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/admin/rules/assignment';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('GET', p, args.body, args.query);
  }
  async post_admin_rules_assignment(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/admin/rules/assignment';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
  async patch_admin_rules_assignment_id_(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/admin/rules/assignment/{id}';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('PATCH', p, args.body, args.query);
  }
  async delete_admin_rules_assignment_id_(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/admin/rules/assignment/{id}';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('DELETE', p, args.body, args.query);
  }
}