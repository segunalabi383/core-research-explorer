import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { YearSummary } from '../core/models';
import { YearChart } from './year-chart';

beforeEach(() => {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
});

describe('YearChart', () => {
  const summary: YearSummary = {
    query: 'drone',
    years: [
      { year: 2018, count: 5 },
      { year: 2020, count: 10 },
    ],
    dated: 15,
    totalHits: null,
  };

  it('draws a bar per year, including empty years, and reports coverage', () => {
    const fixture = TestBed.createComponent(YearChart);
    fixture.componentRef.setInput('summary', summary);
    fixture.componentRef.setInput('total', 20);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('g.bar').length).toBe(3);
    expect(el.querySelector('.coverage')!.textContent).toContain('5 of 20 matches have no usable year');
    expect(el.querySelector('.caption')!.textContent).toContain('2020');
  });

  it('emits the year when a bar is clicked or chosen with the keyboard', () => {
    const fixture = TestBed.createComponent(YearChart);
    fixture.componentRef.setInput('summary', summary);
    fixture.detectChanges();
    const picked: number[] = [];
    fixture.componentInstance.selectYear.subscribe((y) => picked.push(y));
    const bars = fixture.nativeElement.querySelectorAll('g.bar');
    bars[0].dispatchEvent(new MouseEvent('click'));
    bars[1].dispatchEvent(new MouseEvent('click')); // 2019 has no papers: ignored
    bars[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(picked).toEqual([2018, 2020]);
  });

  it('shows a table view on request', () => {
    const fixture = TestBed.createComponent(YearChart);
    fixture.componentRef.setInput('summary', summary);
    fixture.detectChanges();
    const tableButton = [...fixture.nativeElement.querySelectorAll('button')].find((b: HTMLElement) => b.textContent!.includes('Table'))!;
    tableButton.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(2);
  });
});
