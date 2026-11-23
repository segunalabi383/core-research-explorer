import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';
import { readJson, writeJson } from './storage';

export type Theme = 'light' | 'dark';
const KEY = 'cre.theme.v1';
const isTheme = (value: unknown): value is Theme => value === 'light' || value === 'dark';

/** Light or dark. Starts from the system setting until the person picks one. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly prefersDark = globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  readonly theme = signal<Theme>(readJson<Theme>(KEY, isTheme, this.prefersDark ? 'dark' : 'light'));

  constructor() {
    effect(() => {
      this.document.documentElement.dataset['theme'] = this.theme();
    });
  }

  toggle(): void {
    this.theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
    writeJson(KEY, this.theme());
  }
}
