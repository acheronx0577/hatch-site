import { HttpClient } from '../client';
export class WebhooksApi {
  constructor(private http: HttpClient){}
  async get_webhooks_subscriptions(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/webhooks/subscriptions';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('GET', p, args.body, args.query);
  }
  async post_webhooks_outbox_flush(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/webhooks/outbox/flush';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
  async post_webhooks_simulate_eventType_(args: { path?: Record<string,string>, body?: any, query?: Record<string,any> } = {}) {
    let p = '/webhooks/simulate/{eventType}';
    if (args.path) Object.entries(args.path).forEach(([k,v]) => p = p.replace('{'+k+'}', v));
    return this.http.request('POST', p, args.body, args.query);
  }
}