import { DecimalPipe, PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { compactNumber, fillGaps, layoutChart, selectYears } from '../core/chart-data';
import { YearSummary } from '../core/models';

@Component({
  selector: 'app-year-chart',
  imports: [DecimalPipe, PercentPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card chart" aria-labelledby="chart-title">
      <header>
        <div>
          <h2 id="chart-title">Papers by publication year</h2>
          <p class="sub">
            @if (summary() && !canFilter()) {
              Every match for this query, counted by CORE. Year filtering is off for this query, because
              CORE would ignore part of it.
            } @else if (summary()) {
              Every match for this query, counted by CORE. Click a bar to filter the list.
            } @else {
              Search to see when matching papers were published.
            }
          </p>
        </div>
        @if (summary()?.years?.length) {
          <div class="toggles">
            <button type="button" class="btn btn-sm" (click)="range.set(range() === 'recent' ? 'all' : 'recent')">
              {{ range() === 'recent' ? 'All years' : 'Last 30 years' }}
            </button>
            <button type="button" class="btn btn-sm" (click)="showTable.update(v => !v)" [attr.aria-expanded]="showTable()">
              {{ showTable() ? 'Hide table' : 'Table' }}
            </button>
          </div>
        }
      </header>

      @if (loading() && !summary()) {
        <div class="placeholder pulse" aria-label="Loading chart"></div>
      } @else if (error()) {
        <div class="placeholder message">
          <p>{{ error() }}</p>
          <button type="button" class="btn btn-sm" (click)="retry.emit()">Try again</button>
        </div>
      } @else if (!summary()) {
        <div class="placeholder message"><p>No query yet.</p></div>
      } @else if (!bars().length) {
        <div class="placeholder message"><p>CORE has no publication years for these matches.</p></div>
      } @else {
        <p class="caption" aria-live="polite">
          @if (active(); as a) {
            <strong>{{ a.year }}</strong>: {{ a.count | number }} {{ a.count === 1 ? 'paper' : 'papers' }}
          } @else if (selectedYear() !== null) {
            Showing <strong>{{ selectedYear() }}</strong> only. Click it again to clear.
          } @else {
            Peak: <strong>{{ peak()?.year }}</strong> with {{ peak()?.count | number }} papers
          }
        </p>
        <svg [attr.viewBox]="'0 0 ' + layout().width + ' ' + layout().height" role="group" aria-label="Bar chart of papers per year. Use Tab to move between years and Enter to filter.">
          @for (t of layout().ticks; track t.value) {
            <line class="grid" [attr.x1]="layout().plot.left" [attr.x2]="layout().plot.right" [attr.y1]="t.y" [attr.y2]="t.y" />
            <text class="tick" [attr.x]="layout().plot.left - 6" [attr.y]="t.y + 4" text-anchor="end">{{ compact(t.value) }}</text>
          }
          @for (b of layout().bars; track b.year) {
            <g
              class="bar"
              [class.selected]="b.year === selectedYear()"
              [class.dim]="selectedYear() !== null && b.year !== selectedYear()"
              [attr.tabindex]="b.count > 0 ? 0 : -1"
              [attr.role]="canFilter() ? 'button' : 'img'"
              [class.static]="!canFilter()"
              [attr.aria-pressed]="b.year === selectedYear()"
              [attr.aria-label]="b.year + ': ' + b.count + ' papers'"
              (mouseenter)="active.set(b)"
              (mouseleave)="active.set(null)"
              (focus)="active.set(b)"
              (blur)="active.set(null)"
              (click)="pick(b.year, b.count)"
              (keydown.enter)="pick(b.year, b.count)"
              (keydown.space)="$event.preventDefault(); pick(b.year, b.count)"
            >
              <rect class="hit" [attr.x]="b.x - 2" [attr.width]="b.width + 4" [attr.y]="layout().plot.top" [attr.height]="layout().plot.bottom - layout().plot.top" />
              <rect class="fill" [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.width" [attr.height]="b.height" rx="2" />
            </g>
            @if (b.showLabel) {
              <text class="tick" [attr.x]="b.x + b.width / 2" [attr.y]="layout().height - 8" text-anchor="middle">{{ b.year }}</text>
            }
          }
        </svg>

        <p class="coverage">
          {{ summary()!.dated | number }} papers with a year
          @if (total() !== null && total()! > summary()!.dated) {
            · {{ total()! - summary()!.dated | number }} of {{ total()! | number }} matches have no usable year
          }
          @if (older() > 0) {
            · {{ older() | number }} published before {{ bars()[0].year }} (see All years)
          }
        </p>

        @if (showTable()) {
          <div class="table-wrap">
            <table>
              <caption class="visually-hidden">Papers per publication year</caption>
              <thead><tr><th scope="col">Year</th><th scope="col">Papers</th><th scope="col">Share</th></tr></thead>
              <tbody>
                @for (y of tableRows(); track y.year) {
                  <tr [class.selected]="y.year === selectedYear()">
                    <td><button type="button" class="link" (click)="pick(y.year, y.count)">{{ y.year }}</button></td>
                    <td>{{ y.count | number }}</td>
                    <td>{{ y.count / summary()!.dated | percent: '1.0-1' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      }
    </section>
  `,
  styles: `
    .chart { padding: 1rem 1.1rem 1.1rem; }
    header { display: flex; justify-content: space-between; gap: .8rem; align-items: flex-start; }
    h2 { margin: 0; font-size: 1rem; }
    .sub { margin: .15rem 0 0; color: var(--muted); font-size: .8rem; }
    .toggles { display: flex; gap: .3rem; flex-shrink: 0; }
    .caption { margin: .8rem 0 .2rem; font-size: .85rem; color: var(--text-2); min-height: 1.4em; }
    svg { width: 100%; height: auto; display: block; overflow: visible; }
    .grid { stroke: var(--border); stroke-width: 1; }
    .tick { fill: var(--muted); font-size: 11px; }
    .bar { cursor: pointer; outline: none; }
    .bar.static { cursor: default; }
    .hit { fill: transparent; }
    .fill { fill: var(--bar); transition: fill .15s, opacity .15s; }
    .bar:hover .fill, .bar:focus-visible .fill { fill: var(--bar-active); }
    .bar:focus-visible .hit { fill: var(--accent-soft); }
    .bar.selected .fill { fill: var(--bar-active); }
    .bar.dim .fill { opacity: .35; }
    .coverage { margin: .6rem 0 0; font-size: .76rem; color: var(--muted); }
    .placeholder { height: 200px; margin-top: .8rem; border-radius: var(--radius-sm); background: var(--surface-2); }
    .message { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .5rem;
      color: var(--muted); font-size: .88rem; text-align: center; padding: 1rem; }
    .message p { margin: 0; }
    .pulse { animation: pulse 1.2s ease-in-out infinite; }
    @keyframes pulse { 50% { opacity: .5; } }
    .table-wrap { max-height: 260px; overflow: auto; margin-top: .8rem; border: 1px solid var(--border); border-radius: var(--radius-sm); }
    table { width: 100%; border-collapse: collapse; font-size: .84rem; }
    th, td { padding: .35rem .7rem; text-align: right; border-bottom: 1px solid var(--border); }
    th:first-child, td:first-child { text-align: left; }
    thead th { position: sticky; top: 0; background: var(--surface-2); font-weight: 600; }
    tr.selected td { background: var(--accent-soft); }
    .link { padding: 0; border: 0; background: none; color: var(--accent); cursor: pointer; }
  `,
})
export class YearChart {
  readonly summary = input<YearSummary | undefined>();
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  /** Total matches for the query, when known, to report how many have no year. */
  readonly total = input<number | null>(null);
  readonly selectedYear = input<number | null>(null);
  /** False when adding a year would make CORE ignore part of the query. */
  readonly canFilter = input(true);
  readonly selectYear = output<number>();
  readonly retry = output<void>();

  protected readonly range = signal<'recent' | 'all'>('recent');
  protected readonly showTable = signal(false);
  protected readonly active = signal<{ year: number; count: number } | null>(null);

  private readonly selection = computed(() => selectYears(this.summary()?.years ?? [], this.range()));
  protected readonly bars = computed(() => fillGaps(this.selection().shown));
  protected readonly older = computed(() => this.selection().older);
  protected readonly layout = computed(() => layoutChart(this.bars()));
  protected readonly peak = computed(() =>
    this.bars().reduce<{ year: number; count: number } | null>((best, y) => (!best || y.count > best.count ? y : best), null),
  );
  protected readonly tableRows = computed(() => [...(this.summary()?.years ?? [])].reverse());
  protected readonly compact = compactNumber;

  protected pick(year: number, count: number): void {
    if (count > 0 && this.canFilter()) this.selectYear.emit(year);
  }
}
