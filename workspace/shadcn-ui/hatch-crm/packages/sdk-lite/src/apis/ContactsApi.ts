import { HttpClient } from '../client';
export class ContactsApi {
  constructor(private http: HttpClient){}
  async get_contacts(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/contacts';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('GET', p, args.body, args.query);
  }
  async post_contacts(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/contacts';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
  async get_contacts_views(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/contacts/views';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('GET', p, args.body, args.query);
  }
  async post_contacts_views(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/contacts/views';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
  async delete_contacts_views_id_(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/contacts/views/{id}';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('DELETE', p, args.body, args.query);
  }
  async get_contacts_id_(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/contacts/{id}';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('GET', p, args.body, args.query);
  }
  async patch_contacts_id_(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/contacts/{id}';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('PATCH', p, args.body, args.query);
  }
  async delete_contacts_id_(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/contacts/{id}';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('DELETE', p, args.body, args.query);
  }
  async post_contacts_id_restore(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/contacts/{id}/restore';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
  async post_contacts_id_assign(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/contacts/{id}/assign';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
}