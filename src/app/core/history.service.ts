import { Injectable, effect, signal } from '@angular/core';
import { readJson, writeJson } from './storage';

const KEY = 'cre.recentSearches.v1';
const MAX_RECENT = 8;

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((v) => typeof v === 'string');

/** The last few successful searches, newest first, shown as one-click chips. */
@Injectable({ providedIn: 'root' })
export class HistoryService {
  private readonly list = signal<string[]>(readJson(KEY, isStringList, []).slice(0, MAX_RECENT));
  readonly recent = this.list.asReadonly();

  constructor() {
    effect(() => writeJson(KEY, this.list()));
  }

  remember(query: string): void {
    const q = query.trim();
    if (!q) return;
    this.list.update((list) => [q, ...list.filter((item) => item !== q)].slice(0, MAX_RECENT));
  }

  forget(query: string): void {
    this.list.update((list) => list.filter((item) => item !== query));
  }

  clear(): void {
    this.list.set([]);
  }
}
