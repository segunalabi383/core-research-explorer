import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { pageItems } from '../core/paging';

@Component({
  selector: 'app-pager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (total() > 1) {
      <nav aria-label="Result pages">
        <button type="button" class="btn btn-sm" [disabled]="current() <= 1" (click)="go.emit(current() - 1)">← Previous</button>
        <ol>
          @for (item of items(); track $index) {
            <li>
              @if (item === null) {
                <span class="gap" aria-hidden="true">…</span>
              } @else {
                <button
                  type="button"
                  class="page"
                  [class.current]="item === current()"
                  [attr.aria-current]="item === current() ? 'page' : null"
                  [attr.aria-label]="'Page ' + item"
                  (click)="go.emit(item)"
                >{{ item }}</button>
              }
            </li>
          }
        </ol>
        <button type="button" class="btn btn-sm" [disabled]="current() >= total()" (click)="go.emit(current() + 1)">Next →</button>
      </nav>
    }
  `,
  styles: `
    nav { display: flex; align-items: center; justify-content: center; gap: .5rem; flex-wrap: wrap; margin: 1.2rem 0 .4rem; }
    ol { display: flex; gap: .25rem; list-style: none; margin: 0; padding: 0; flex-wrap: wrap; }
    .page { min-width: 34px; height: 32px; padding: 0 .4rem; border: 1px solid var(--border); border-radius: var(--radius-sm);
      background: var(--surface); cursor: pointer; font-size: .85rem; }
    .page:hover { border-color: var(--accent); color: var(--accent); }
    .page.current { background: var(--accent); border-color: var(--accent); color: var(--on-accent); font-weight: 600; }
    .gap { display: inline-block; padding: 0 .3rem; color: var(--muted); line-height: 32px; }
  `,
})
export class Pager {
  readonly current = input.required<number>();
  readonly total = input.required<number>();
  readonly go = output<number>();
  protected readonly items = computed(() => pageItems(this.current(), this.total()));
}
