export const TRAITS = ['ambition', 'loyalty', 'greed', 'courage', 'honor', 'curiosity', 'temper', 'discipline'] as const;
export type TraitKey = typeof TRAITS[number];
export type Traits = Record<TraitKey, number>;

export type NeedKey = 'hunger' | 'rest' | 'safety' | 'social' | 'purpose';
export type Needs = Record<NeedKey, number>; // 0 = qondirilgan, 100 = juda zarur

export type Role =
  | 'sect_leader' | 'elder' | 'inner_disciple' | 'outer_disciple'
  | 'bandit_chief' | 'bandit_lieutenant' | 'bandit'
  | 'magistrate' | 'guard_captain' | 'guard'
  | 'farmer' | 'merchant' | 'innkeeper' | 'doctor' | 'blacksmith'
  | 'hermit' | 'wanderer' | 'child';

export const MARTIAL_ROLES: readonly Role[] = [
  'sect_leader', 'elder', 'inner_disciple', 'outer_disciple',
  'bandit_chief', 'bandit_lieutenant', 'bandit', 'guard_captain', 'guard', 'hermit', 'wanderer',
];

export interface Relation { trust: number; respect: number; affection: number; fear: number; debt: number; }
export const REL_KEYS = ['trust', 'respect', 'affection', 'fear', 'debt'] as const;

export type BondType = 'master' | 'student' | 'family' | 'friend' | 'rival' | 'lover' | 'sworn' | 'spouse';
export interface Bond { other: string; type: BondType; }

export type MemoryType =
  | 'saved_life' | 'helped' | 'gift' | 'taught' | 'insulted' | 'attacked' | 'killed'
  | 'stole' | 'betrayed' | 'breakthrough' | 'promoted' | 'bribed' | 'raided' | 'mourned';

export interface Memory {
  id: string;
  origin: string;           // asl xotira id'si (gossip nusxalari uchun)
  type: MemoryType;
  subject: string;          // kim qildi ('unknown' bo'lishi mumkin)
  object: string | null;    // kimga qilindi
  day: number;
  location: string;
  importance: number;
  permanence: number;       // 1 = unutilmaydi
  source: 'witnessed' | 'heard';
  confidence: number;
  truth?: string;           // 'unknown' subyekt ortidagi haqiqiy shaxs (faqat sim biladi)
  secret?: boolean;         // xavfli sir: faqat jasorat va ishonch bilan aytiladi
}

export type GoalType = 'avenge' | 'seek_master' | 'rank_up' | 'wealth' | 'surpass' | 'find_manual' | 'bounty';
export interface Goal { type: GoalType; target?: string; since: number; lastPetition?: number; amount?: number; tries?: number; done?: boolean; }

export interface Leg { road: string; to: string; hours: number; }
export interface Travel { from: string; legs: Leg[]; index: number; legArrive: number; final: string; purpose: string; }

export interface NPCData {
  id: string; name: string; age: number; role: Role; faction: string | null; home: string;
  realm: number; progress: number; talent: number; silver: number; traits: Traits; bonds: Bond[];
}

export interface NPC extends NPCData {
  location: string;
  needs: Needs;
  injury: number;
  alive: boolean;
  deathDay?: number;
  causeOfDeath?: string;
  killer?: string;
  goals: Goal[];
  memories: Memory[];
  relations: Record<string, Relation>;
  travel?: Travel;
  opId?: string;
  action: string;
  taughtByHermit?: boolean;
  dismissed?: boolean;
  player?: boolean;         // o'yinchi boshqaradi: AI harakat qilmaydi
  aff?: string;             // iste'dod turi (cultivation.ts): sword | fist | qi | body | alchemy | medicine | craft
  techs?: string[];         // o'rgangan uslublari
  tp?: number;              // uslublar kuchi ko'paytiruvchisi (keshlangan)
}

export interface Location { id: string; name: string; kind: 'sect' | 'road' | 'village' | 'city' | 'camp' | 'cave' | 'site'; qi: number; owner?: string; x?: number; y?: number; }
export interface Path { a: string; b: string; road: string; hours: number; pts?: [number, number][]; }

export interface Succession { start: number; end: number; claimants: string[]; }

export interface Faction {
  id: string; name: string; ideology: 'righteous' | 'neutral' | 'demonic'; base: string;
  leader: string | null; silver: number; tension: Record<string, number>; cohesion: number;
  active: boolean; lastOpDay: number;
  succession?: Succession; foundedDay?: number; parent?: string; bribed?: string; disbandedDay?: number;
  wars?: string[]; allies?: string[];   // sektalararo diplomatiya
  tourney?: { vs: string; day: number; host: boolean; player?: 'win' | 'lose' };   // e'lon qilingan musobaqa
}

export type OpType = 'raid' | 'ambush' | 'expedition' | 'patrol';
export interface Operation {
  id: string; faction: string; type: OpType; target: string;
  start: number; end: number; members: string[]; resolved: boolean; engaged: string[];
}

export interface SimEvent {
  seq: number; h: number; day: number; type: string; location: string;
  subject?: string; object?: string; data?: Record<string, unknown>; secret?: boolean;
}

export interface StorySeed {
  id: string; key: string; type: string; day: number; roles: Record<string, string>;
  drama: number; surfaced: boolean; channel?: string; status: 'open' | 'resolved';
  resolvedDay?: number; outcome?: string;
}
