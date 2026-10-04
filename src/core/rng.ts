// Deterministik RNG: mulberry32. Har tizim o'z oqimiga (stream) ega.
export class Rng {
  constructor(public state: number) {}
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number { return a + (b - a) * this.next(); }
  int(a: number, b: number): number { return Math.floor(this.range(a, b + 1)); }
  chance(p: number): boolean { return this.next() < p; }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export class RngStreams {
  private streams = new Map<string, Rng>();
  constructor(public seed: number, states?: Record<string, number>) {
    if (states) for (const [k, v] of Object.entries(states)) this.streams.set(k, new Rng(v));
  }
  get(name: string): Rng {
    let r = this.streams.get(name);
    if (!r) { r = new Rng(hashString(`${this.seed}:${name}`)); this.streams.set(name, r); }
    return r;
  }
  snapshot(): Record<string, number> {
    const o: Record<string, number> = {};
    for (const k of [...this.streams.keys()].sort()) o[k] = this.streams.get(k)!.state;
    return o;
  }
}
