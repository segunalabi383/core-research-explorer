import { Injectable, computed, effect, signal } from '@angular/core';
import { Paper } from './models';
import { readJson, writeJson } from './storage';

const KEY = 'cre.readingList.v1';
const MAX_SAVED = 500;

function isPaper(value: unknown): value is Paper {
  const p = value as Paper | null;
  return (
    !!p &&
    typeof p.id === 'string' &&
    typeof p.title === 'string' &&
    Array.isArray(p.authors) &&
    Array.isArray(p.links) &&
    typeof p.coreUrl === 'string'
  );
}

function isPaperList(value: unknown): value is Paper[] {
  return Array.isArray(value) && value.every(isPaper);
}

/** Papers the person has saved. Kept in this browser between visits. */
@Injectable({ providedIn: 'root' })
export class ReadingListService {
  private readonly saved = signal<Paper[]>(readJson(KEY, isPaperList, []));
  readonly papers = this.saved.asReadonly();
  readonly count = computed(() => this.saved().length);
  private readonly ids = computed(() => new Set(this.saved().map((p) => p.id)));

  constructor() {
    effect(() => writeJson(KEY, this.saved()));
  }

  has(id: string): boolean {
    return this.ids().has(id);
  }

  toggle(paper: Paper): void {
    if (this.has(paper.id)) this.remove(paper.id);
    else this.saved.update((list) => [paper, ...list].slice(0, MAX_SAVED));
  }

  remove(id: string): void {
    this.saved.update((list) => list.filter((p) => p.id !== id));
  }

  clear(): void {
    this.saved.set([]);
  }
}
