import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, linkedSignal, signal, viewChild } from '@angular/core';
import { HistoryService } from '../core/history.service';
import { checkQuery } from '../core/query';
import { SearchStore } from '../core/search.store';
import { LIMIT_PRESETS, MAX_LIMIT } from '../core/url-state';

@Component({
  selector: 'app-search-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="search" role="search" (submit)="submit($event)" novalidate>
      <label class="visually-hidden" for="q">Search query</label>
      <div class="field" [class.invalid]="showError()">
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input
          #input
          id="q"
          type="search"
          autocomplete="off"
          spellcheck="false"
          placeholder="Try (drone AND (package OR delivery))"
          [value]="draft()"
          (input)="onInput($event)"
          [attr.aria-invalid]="showError()"
          aria-describedby="q-help"
        />
        <kbd class="shortcut" aria-hidden="true">/</kbd>
      </div>

      <div class="limit">
        <label for="limit">Papers per page</label>
        <select id="limit" (change)="onPreset($event)">
          @for (n of presets; track n) {
            <option [value]="n" [selected]="presetValue() === '' + n">{{ n }}</option>
          }
          <option value="custom" [selected]="presetValue() === 'custom'">Custom…</option>
        </select>
        @if (customOpen()) {
          <input
            class="custom"
            type="number"
            min="1"
            [max]="maxLimit"
            [value]="store.limit()"
            (change)="onCustom($event)"
            aria-label="Custom number of papers per page, 1 to 100"
          />
        }
      </div>

      <button class="btn btn-primary go" type="submit">Search</button>
    </form>

    <div id="q-help" class="feedback" aria-live="polite">
      @if (showError()) {
        <p class="error">{{ check().error }}</p>
      } @else if (check().hint) {
        <p class="hint">{{ check().hint }}</p>
      }
    </div>

    <div class="rows">
      @if (history.recent().length) {
        <div class="row">
          <span class="label">Recent</span>
          @for (q of history.recent(); track q) {
            <span class="recent">
              <button type="button" class="chip" (click)="use(q)">{{ q }}</button>
              <button type="button" class="forget" (click)="history.forget(q)" [attr.aria-label]="'Remove ' + q + ' from recent searches'">×</button>
            </span>
          }
        </div>
      }
      <details class="syntax">
        <summary>Search syntax</summary>
        <div class="grid">
          @for (e of examples; track e.q) {
            <button type="button" class="example" (click)="use(e.q)">
              <code>{{ e.q }}</code><span>{{ e.note }}</span>
            </button>
          }
        </div>
        <p class="note">
          Operators must be in capitals. Words next to each other are combined with AND.
          <a href="https://api.core.ac.uk/docs/v3#section/How-to-search" target="_blank" rel="noopener noreferrer">CORE's full guide</a>
        </p>
      </details>
    </div>
  `,
  styles: `
    :host { display: block; }
    .search { display: grid; grid-template-columns: 1fr auto auto; gap: .6rem; align-items: end; }
    .field { position: relative; display: flex; align-items: center; }
    .field input { width: 100%; height: 46px; padding: 0 2.6rem 0 2.5rem; border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm); background: var(--surface); font-size: 1rem; }
    .field input::-webkit-search-cancel-button { display: none; }
    .field input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
    .field.invalid input { border-color: var(--danger); box-shadow: 0 0 0 3px var(--danger-soft); }
    .icon { position: absolute; left: .8rem; width: 18px; height: 18px; fill: none; stroke: var(--muted); stroke-width: 2; stroke-linecap: round; }
    .shortcut { position: absolute; right: .8rem; color: var(--muted); }
    .limit { display: flex; flex-direction: column; gap: .2rem; font-size: .75rem; color: var(--muted); }
    .limit > div { display: flex; gap: .3rem; }
    select, .custom { height: 46px; border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
      background: var(--surface); padding: 0 .6rem; font-size: .95rem; }
    .custom { width: 5.5rem; margin-top: .3rem; }
    .go { height: 46px; padding: 0 1.4rem; font-size: 1rem; }
    .feedback p { margin: .5rem 0 0; font-size: .87rem; }
    .error { color: var(--danger); }
    .hint { color: var(--text-2); }
    .rows { display: flex; flex-direction: column; gap: .6rem; margin-top: .8rem; }
    .row { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem; }
    .label { font-size: .78rem; color: var(--muted); margin-right: .2rem; }
    .recent { display: inline-flex; align-items: center; }
    .recent .chip { border-top-right-radius: 0; border-bottom-right-radius: 0; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; line-height: 26px; }
    .forget { height: 28px; padding: 0 .5rem; border: 1px solid var(--border); border-left: 0; border-radius: 0 999px 999px 0;
      background: var(--surface); color: var(--muted); cursor: pointer; }
    .forget:hover { color: var(--danger); }
    .syntax summary { cursor: pointer; color: var(--accent); font-size: .85rem; font-weight: 500; width: fit-content; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: .4rem; margin-top: .6rem; }
    .example { display: flex; flex-direction: column; align-items: flex-start; gap: .1rem; padding: .5rem .65rem; text-align: left;
      border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); cursor: pointer; }
    .example:hover { border-color: var(--accent); }
    .example span { font-size: .76rem; color: var(--muted); }
    .note { font-size: .78rem; color: var(--muted); margin: .6rem 0 0; }
    @media (max-width: 720px) {
      .search { grid-template-columns: 1fr 1fr; }
      .field { grid-column: 1 / -1; }
      .go { width: 100%; }
    }
  `,
})
export class SearchPanel {
  protected readonly store = inject(SearchStore);
  protected readonly history = inject(HistoryService);
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');

  /** What is typed. Follows the store when the search changes elsewhere (Back, a chip, a link). */
  protected readonly draft = linkedSignal(() => this.store.query());
  protected readonly touched = signal(false);
  protected readonly check = computed(() => checkQuery(this.draft()));
  protected readonly showError = computed(() => this.touched() && this.draft().trim() !== '' && !!this.check().error);

  protected readonly presets = LIMIT_PRESETS;
  protected readonly maxLimit = MAX_LIMIT;
  protected readonly customOpen = linkedSignal(() => !(LIMIT_PRESETS as readonly number[]).includes(this.store.limit()));
  protected readonly presetValue = computed(() => (this.customOpen() ? 'custom' : String(this.store.limit())));

  protected readonly examples = [
    { q: '(drone AND (package OR delivery))', note: 'Group with brackets' },
    { q: '"climate change" AND adaptation', note: 'Exact phrase plus a word' },
    { q: 'crispr NOT review', note: 'Leave a word out' },
    { q: 'title:"machine learning"', note: 'Search one field only' },
    { q: 'authors:(smith OR jones)', note: 'Apply a field to a group' },
    { q: 'drone AND yearPublished>2020', note: 'Compare numbers' },
  ];

  focus(): void {
    this.input().nativeElement.focus();
    this.input().nativeElement.select();
  }

  protected onInput(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
    // Errors appear after the first attempt to search, then update live as the query is fixed.
    if (!this.draft().trim()) this.touched.set(false);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    this.touched.set(true);
    const q = this.draft().trim();
    if (!q) {
      this.focus();
      return;
    }
    if (!this.check().error) this.store.search(q);
  }

  protected use(query: string): void {
    this.draft.set(query);
    this.touched.set(false);
    this.store.search(query);
  }

  protected onPreset(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'custom') {
      this.customOpen.set(true);
      return;
    }
    this.customOpen.set(false);
    this.store.setLimit(Number(value));
  }

  protected onCustom(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = Number(input.value);
    if (Number.isFinite(value) && value >= 1) this.store.setLimit(value);
    input.value = String(this.store.limit());
  }
}
