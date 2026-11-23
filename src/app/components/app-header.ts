import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { ReadingListService } from '../core/reading-list.service';
import { ThemeService } from '../core/theme.service';

@Component({
  selector: 'app-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header>
      <a class="brand" href="/" (click)="goHome($event)">
        <svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" /><path d="M9 25v-8M16 25V11M23 25V7" /></svg>
        <span>CORE Research Explorer</span>
      </a>
      <nav aria-label="Tools">
        <button type="button" class="btn btn-ghost" (click)="openReadingList.emit()">
          Reading list
          @if (list.count()) {
            <span class="badge" [attr.aria-label]="list.count() + ' saved'">{{ list.count() }}</span>
          }
        </button>
        <button
          type="button"
          class="btn btn-ghost icon"
          (click)="theme.toggle()"
          [attr.aria-label]="theme.theme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
        >
          {{ theme.theme() === 'dark' ? '☀' : '☾' }}
        </button>
      </nav>
    </header>
  `,
  styles: `
    header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; max-width: 1240px;
      margin: 0 auto; padding: .7rem 1.25rem; }
    .brand { display: flex; align-items: center; gap: .55rem; color: var(--text); text-decoration: none; font-weight: 650; }
    .brand svg { width: 28px; height: 28px; }
    .brand rect { fill: var(--accent); }
    .brand path { stroke: var(--on-accent); stroke-width: 4; stroke-linecap: round; }
    nav { display: flex; gap: .2rem; }
    .badge { min-width: 20px; height: 20px; padding: 0 .35rem; border-radius: 999px; background: var(--accent);
      color: var(--on-accent); font-size: .72rem; display: inline-flex; align-items: center; justify-content: center; }
    .icon { font-size: 1.1rem; width: 40px; padding: 0; }
    @media (max-width: 520px) { .brand span { display: none; } }
  `,
})
export class AppHeader {
  protected readonly list = inject(ReadingListService);
  protected readonly theme = inject(ThemeService);
  readonly openReadingList = output<void>();
  readonly home = output<void>();

  protected goHome(event: MouseEvent): void {
    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    this.home.emit();
  }
}
