import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { AppHeader } from './components/app-header';
import { Pager } from './components/pager';
import { PaperCard } from './components/paper-card';
import { PaperSkeleton } from './components/paper-skeleton';
import { ReadingListPanel } from './components/reading-list-panel';
import { SearchPanel } from './components/search-panel';
import { downloadText, exportFilename, papersToCsv } from './core/export';
import { SearchStore } from './core/search.store';

const BASE_TITLE = 'CORE Research Explorer';

@Component({
  selector: 'app-root',
  imports: [AppHeader, SearchPanel, PaperCard, PaperSkeleton, Pager, ReadingListPanel, DecimalPipe],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKeydown($event)' },
})
export class App {
  protected readonly store = inject(SearchStore);
  private readonly title = inject(Title);
  private readonly searchPanel = viewChild.required(SearchPanel);
  private readonly readingList = viewChild.required(ReadingListPanel);
  private readonly resultsTop = viewChild<ElementRef<HTMLElement>>('resultsTop');

  protected readonly skeletons = [0, 1, 2, 3, 4];
  protected readonly linkCopied = signal(false);
  protected readonly examples = [
    '(drone AND (package OR delivery))',
    '"climate change" AND adaptation',
    'crispr NOT review',
    'title:"large language models"',
  ];

  /** "Showing 21–30 of 71,213". */
  protected readonly range = computed(() => {
    const shown = this.store.shown();
    if (!shown || shown.papers.length === 0) return null;
    return { from: shown.offset + 1, to: shown.offset + shown.papers.length, total: shown.totalHits };
  });

  constructor() {
    effect(() => {
      const q = this.store.query();
      const page = this.store.page();
      this.title.setTitle(q ? `${q}${page > 1 ? ` · page ${page}` : ''} · ${BASE_TITLE}` : BASE_TITLE);
    });
  }

  /** "/" jumps to the search box, unless the person is already typing somewhere. */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"], dialog[open]')) return;
    event.preventDefault();
    this.searchPanel().focus();
  }

  protected goToPage(page: number): void {
    this.store.goToPage(page);
    const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.resultsTop()?.nativeElement.scrollIntoView?.({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  protected openReadingList(): void {
    this.readingList().open();
  }

  protected goHome(): void {
    this.store.reset();
    this.searchPanel().focus();
  }

  protected exportPage(): void {
    const shown = this.store.shown();
    if (!shown) return;
    const label = `${shown.baseQuery}${shown.year ? `-${shown.year}` : ''}-page-${shown.page}`;
    downloadText(exportFilename(label, 'csv'), papersToCsv(shown.papers), 'text/csv;charset=utf-8');
  }

  protected async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(globalThis.location.href);
      this.linkCopied.set(true);
      setTimeout(() => this.linkCopied.set(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  }
}
