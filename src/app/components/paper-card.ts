import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { papersToBibtex } from '../core/export';
import { Paper } from '../core/models';
import { ReadingListService } from '../core/reading-list.service';
import { HighlightPipe } from './highlight.pipe';

const AUTHORS_SHOWN = 6;
const ABSTRACT_PREVIEW = 360;

@Component({
  selector: 'app-paper-card',
  imports: [HighlightPipe, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = paper();
    <article class="card paper" [attr.aria-labelledby]="'t-' + p.id">
      <div class="meta">
        @if (p.year) {
          <span class="year">{{ p.year }}</span>
        }
        @if (p.documentType) {
          <span class="tag">{{ p.documentType }}</span>
        }
        @if (p.citationCount) {
          <span>{{ p.citationCount | number }} citations</span>
        }
        @if (hasPdf()) {
          <span class="open">Full text available</span>
        }
      </div>

      <h3 [id]="'t-' + p.id">
        <a [href]="p.coreUrl" target="_blank" rel="noopener noreferrer">
          @for (s of p.title | highlight: terms(); track $index) {
            @if (s.match) {<mark>{{ s.text }}</mark>} @else {<span>{{ s.text }}</span>}
          }
        </a>
      </h3>

      @if (p.authors.length) {
        <p class="authors">
          {{ visibleAuthors().join(', ') }}
          @if (hiddenAuthors() > 0) {
            <button type="button" class="link" (click)="showAllAuthors.set(true)">and {{ hiddenAuthors() }} more</button>
          }
        </p>
      }
      @if (p.publisher) {
        <p class="publisher">{{ p.publisher }}</p>
      }

      @if (p.abstract) {
        <p class="abstract" [id]="'a-' + p.id">
          @for (s of abstractText() | highlight: terms(); track $index) {
            @if (s.match) {<mark>{{ s.text }}</mark>} @else {<span>{{ s.text }}</span>}
          }
          @if (abstractTruncated()) {<span>…</span>}
        </p>
        @if (abstractLong()) {
          <button type="button" class="link" (click)="expanded.update(v => !v)" [attr.aria-expanded]="expanded()" [attr.aria-controls]="'a-' + p.id">
            {{ expanded() ? 'Show less' : 'Read full abstract' }}
          </button>
        }
      } @else {
        <p class="abstract missing">No abstract available.</p>
      }

      <div class="actions">
        @for (link of p.links; track link.url) {
          <a class="btn btn-sm" [href]="link.url" target="_blank" rel="noopener noreferrer">{{ link.label }}</a>
        }
        <a class="btn btn-sm" [href]="p.coreUrl" target="_blank" rel="noopener noreferrer">View on CORE</a>
        <span class="spacer"></span>
        <button type="button" class="btn btn-sm btn-ghost" (click)="copyCitation()">
          {{ copied() ? 'Copied ✓' : 'Copy BibTeX' }}
        </button>
        <button
          type="button"
          class="btn btn-sm"
          [class.saved]="saved()"
          [attr.aria-pressed]="saved()"
          (click)="readingList.toggle(p)"
        >
          {{ saved() ? '★ Saved' : '☆ Save' }}
        </button>
      </div>
    </article>
  `,
  styles: `
    .paper { padding: 1.1rem 1.2rem; }
    .meta { display: flex; flex-wrap: wrap; gap: .35rem .8rem; font-size: .78rem; color: var(--muted); }
    .year { font-weight: 600; color: var(--text-2); }
    .tag { text-transform: capitalize; }
    .open { color: var(--success); }
    h3 { margin: .35rem 0 .3rem; font: 600 1.14rem/1.35 var(--font-serif); }
    h3 a { color: var(--text); text-decoration: none; }
    h3 a:hover { color: var(--accent); text-decoration: underline; }
    .authors { margin: 0; color: var(--text-2); font-size: .88rem; }
    .publisher { margin: .1rem 0 0; color: var(--muted); font-size: .82rem; font-style: italic; }
    .abstract { margin: .7rem 0 .2rem; color: var(--text-2); font-size: .9rem; }
    .abstract.missing { color: var(--muted); font-style: italic; }
    .link { padding: 0; border: 0; background: none; color: var(--accent); cursor: pointer; font-size: .85rem; }
    .link:hover { text-decoration: underline; }
    .actions { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem; margin-top: .9rem; }
    .spacer { flex: 1; }
    .saved { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
  `,
})
export class PaperCard {
  readonly paper = input.required<Paper>();
  readonly terms = input<readonly string[]>([]);

  protected readonly readingList = inject(ReadingListService);
  protected readonly expanded = signal(false);
  protected readonly showAllAuthors = signal(false);
  protected readonly copied = signal(false);

  protected readonly saved = computed(() => this.readingList.has(this.paper().id));
  protected readonly hasPdf = computed(() => this.paper().links.some((l) => l.kind === 'pdf'));
  protected readonly visibleAuthors = computed(() =>
    this.showAllAuthors() ? this.paper().authors : this.paper().authors.slice(0, AUTHORS_SHOWN),
  );
  protected readonly hiddenAuthors = computed(() => this.paper().authors.length - this.visibleAuthors().length);
  protected readonly abstractLong = computed(() => (this.paper().abstract?.length ?? 0) > ABSTRACT_PREVIEW + 40);
  protected readonly abstractTruncated = computed(() => this.abstractLong() && !this.expanded());
  protected readonly abstractText = computed(() => {
    const text = this.paper().abstract ?? '';
    if (!this.abstractTruncated()) return text;
    const cut = text.lastIndexOf(' ', ABSTRACT_PREVIEW);
    return text.slice(0, cut > 200 ? cut : ABSTRACT_PREVIEW);
  });

  protected async copyCitation(): Promise<void> {
    try {
      await navigator.clipboard.writeText(papersToBibtex([this.paper()]));
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1800);
    } catch {
      /* clipboard blocked: nothing useful to do */
    }
  }
}
