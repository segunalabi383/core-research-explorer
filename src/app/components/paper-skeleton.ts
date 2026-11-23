import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-paper-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card skeleton" aria-hidden="true">
      <span class="line short"></span>
      <span class="line title"></span>
      <span class="line mid"></span>
      <span class="line"></span>
      <span class="line"></span>
      <span class="line mid"></span>
    </div>
  `,
  styles: `
    .skeleton { padding: 1.1rem 1.2rem; display: flex; flex-direction: column; gap: .55rem; }
    .line { display: block; height: 10px; border-radius: 5px; background: var(--surface-2); animation: pulse 1.2s ease-in-out infinite; }
    .short { width: 18%; }
    .title { height: 16px; width: 75%; }
    .mid { width: 55%; }
    @keyframes pulse { 50% { opacity: .45; } }
  `,
})
export class PaperSkeleton {}
