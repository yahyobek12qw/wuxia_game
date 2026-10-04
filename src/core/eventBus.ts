import type { SimEvent } from './types.js';

export type Handler = (ev: SimEvent) => void;

// Tizimlar bir-biri bilan faqat shu bus orqali gaplashadi.
export class EventBus {
  private subs = new Map<string, Handler[]>();
  on(type: string, h: Handler): void {
    const list = this.subs.get(type) ?? [];
    list.push(h);
    this.subs.set(type, list);
  }
  publish(ev: SimEvent): void {
    for (const h of this.subs.get(ev.type) ?? []) h(ev);
    for (const h of this.subs.get('*') ?? []) h(ev);
  }
}
