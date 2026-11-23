import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main style="max-width: 760px; margin: 4rem auto; padding: 0 1.25rem">
      <h1>CORE Research Explorer</h1>
      <p>Search open-access research papers from CORE. The search interface is on its way.</p>
    </main>
  `,
})
export class App {}
