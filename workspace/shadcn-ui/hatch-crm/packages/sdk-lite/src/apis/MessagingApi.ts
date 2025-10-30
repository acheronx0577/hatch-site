import { HttpClient } from '../client';
export class MessagingApi {
  constructor(private http: HttpClient){}
  async post_messages_sms(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/messages/sms';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
  async post_messages_email(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/messages/email';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
  async post_messages_inbound(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/messages/inbound';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
}