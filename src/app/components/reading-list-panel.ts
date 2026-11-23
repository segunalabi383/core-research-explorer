import { ChangeDetectionStrategy, Component, ElementRef, inject, viewChild } from '@angular/core';
import { downloadText, exportFilename, papersToBibtex, papersToCsv } from '../core/export';
import { ReadingListService } from '../core/reading-list.service';

/** A side drawer built on <dialog>, which gives focus trapping and Escape-to-close for free. */
@Component({
  selector: 'app-reading-list-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog aria-labelledby="rl-title" (click)="closeOnBackdrop($event)">
      <div class="panel">
        <header>
          <h2 id="rl-title">Reading list <span class="count">{{ list.count() }}</span></h2>
          <button type="button" class="btn btn-sm btn-ghost" (click)="close()" aria-label="Close reading list">✕</button>
        </header>

        @if (list.count() === 0) {
          <p class="empty">Nothing saved yet. Use <strong>☆ Save</strong> on any paper to keep it here. Your list stays in this browser.</p>
        } @else {
          <div class="tools">
            <button type="button" class="btn btn-sm" (click)="exportBibtex()">Export BibTeX</button>
            <button type="button" class="btn btn-sm" (click)="exportCsv()">Export CSV</button>
            <span class="spacer"></span>
            <button type="button" class="btn btn-sm btn-ghost danger" (click)="clearAll()">Clear all</button>
          </div>
          <ul>
            @for (p of list.papers(); track p.id) {
              <li>
                <div>
                  <a [href]="p.coreUrl" target="_blank" rel="noopener noreferrer">{{ p.title }}</a>
                  <p class="meta">
                    {{ p.authors.slice(0, 3).join(', ') }}@if (p.authors.length > 3) {<span> et al.</span>}
                    @if (p.year) {<span> · {{ p.year }}</span>}
                  </p>
                </div>
                <button type="button" class="btn btn-sm btn-ghost" (click)="list.remove(p.id)" [attr.aria-label]="'Remove ' + p.title">Remove</button>
              </li>
            }
          </ul>
        }
      </div>
    </dialog>
  `,
  styles: `
    dialog { margin: 0 0 0 auto; height: 100dvh; max-height: 100dvh; width: min(460px, 100vw); max-width: 100vw;
      padding: 0; border: 0; border-left: 1px solid var(--border); background: var(--surface); color: var(--text); }
    dialog::backdrop { background: rgb(10 12 16 / .45); }
    .panel { display: flex; flex-direction: column; height: 100%; padding: 1rem 1.1rem; }
    header { display: flex; align-items: center; justify-content: space-between; }
    h2 { margin: 0; font-size: 1.05rem; display: flex; align-items: center; gap: .5rem; }
    .count { font-size: .75rem; padding: .05rem .5rem; border-radius: 999px; background: var(--accent-soft); color: var(--accent); }
    .empty { color: var(--muted); font-size: .9rem; }
    .tools { display: flex; gap: .4rem; margin: .8rem 0; }
    .spacer { flex: 1; }
    .danger { color: var(--danger); }
    ul { list-style: none; margin: 0; padding: 0; overflow: auto; flex: 1; }
    li { display: flex; justify-content: space-between; gap: .6rem; padding: .7rem 0; border-top: 1px solid var(--border); }
    li a { font: 600 .95rem/1.35 var(--font-serif); color: var(--text); text-decoration: none; }
    li a:hover { color: var(--accent); text-decoration: underline; }
    .meta { margin: .2rem 0 0; font-size: .8rem; color: var(--muted); }
  `,
})
export class ReadingListPanel {
  protected readonly list = inject(ReadingListService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  open(): void {
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  protected closeOnBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }

  protected exportBibtex(): void {
    downloadText(exportFilename('reading-list', 'bib'), papersToBibtex(this.list.papers()), 'application/x-bibtex');
  }

  protected exportCsv(): void {
    downloadText(exportFilename('reading-list', 'csv'), papersToCsv(this.list.papers()), 'text/csv;charset=utf-8');
  }

  protected clearAll(): void {
    if (confirm(`Remove all ${this.list.count()} saved papers? This can't be undone.`)) this.list.clear();
  }
}
