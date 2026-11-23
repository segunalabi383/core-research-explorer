import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Paper } from '../core/models';
import { ReadingListService } from '../core/reading-list.service';
import { SearchStore } from '../core/search.store';
import { Pager } from './pager';
import { PaperCard } from './paper-card';
import { SearchPanel } from './search-panel';

const paper: Paper = {
  id: '42',
  title: '<img src=x onerror=alert(1)> Drone delivery',
  authors: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
  year: 2020,
  abstract: 'Drones '.repeat(80),
  publisher: null,
  documentType: null,
  doi: null,
  citationCount: null,
  links: [],
  coreUrl: 'https://core.ac.uk/works/42',
};

beforeEach(() => {
  history.replaceState(null, '', '/');
  localStorage.clear();
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
});

describe('PaperCard', () => {
  function render() {
    const fixture = TestBed.createComponent(PaperCard);
    fixture.componentRef.setInput('paper', paper);
    fixture.componentRef.setInput('terms', ['drone']);
    fixture.detectChanges();
    return fixture;
  }

  it('renders paper text as text, never as HTML', () => {
    const el: HTMLElement = render().nativeElement;
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('h3')!.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(el.querySelector('h3 mark')!.textContent).toBe('Drone');
  });

  it('shortens long author lists and abstracts until asked', () => {
    const fixture = render();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.authors')!.textContent).toContain('and 2 more');
    const toggle = [...el.querySelectorAll('button')].find((b) => b.textContent!.includes('Read full abstract'))!;
    const before = el.querySelector('.abstract')!.textContent!.length;
    toggle.click();
    fixture.detectChanges();
    expect(el.querySelector('.abstract')!.textContent!.length).toBeGreaterThan(before);
  });

  it('saves to and removes from the reading list', () => {
    const fixture = render();
    const list = TestBed.inject(ReadingListService);
    const save = () => [...fixture.nativeElement.querySelectorAll('button')].find((b: HTMLElement) => b.textContent!.includes('Save'))!;
    save().click();
    fixture.detectChanges();
    expect(list.has('42')).toBe(true);
    expect(save().getAttribute('aria-pressed')).toBe('true');
    save().click();
    expect(list.count()).toBe(0);
  });
});

describe('SearchPanel', () => {
  it('shows the exact problem instead of searching a broken query', () => {
    const fixture = TestBed.createComponent(SearchPanel);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const input = el.querySelector<HTMLInputElement>('#q')!;
    input.value = '(drone AND delivery';
    input.dispatchEvent(new Event('input'));
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(el.querySelector('.error')!.textContent).toContain('never closed');
    expect(TestBed.inject(SearchStore).query()).toBe('');
  });

  it('shows the page size from the address bar in the dropdown', () => {
    history.replaceState(null, '', '/?q=drone&limit=25');
    const fixture = TestBed.createComponent(SearchPanel);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('select').value).toBe('25');
  });

  it('opens a custom field for page sizes that are not presets', () => {
    history.replaceState(null, '', '/?q=drone&limit=37');
    const fixture = TestBed.createComponent(SearchPanel);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('select').value).toBe('custom');
    expect(fixture.nativeElement.querySelector('input.custom').value).toBe('37');
  });

  it('searches a valid query', () => {
    const fixture = TestBed.createComponent(SearchPanel);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const input = el.querySelector<HTMLInputElement>('#q')!;
    input.value = '(drone AND (package OR delivery))';
    input.dispatchEvent(new Event('input'));
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    expect(TestBed.inject(SearchStore).query()).toBe('(drone AND (package OR delivery))');
  });
});

describe('Pager', () => {
  it('marks the current page and emits the chosen page', () => {
    const fixture = TestBed.createComponent(Pager);
    fixture.componentRef.setInput('current', 5);
    fixture.componentRef.setInput('total', 20);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[aria-current="page"]')!.textContent).toBe('5');
    const chosen: number[] = [];
    fixture.componentInstance.go.subscribe((p) => chosen.push(p));
    el.querySelector<HTMLButtonElement>('[aria-label="Page 20"]')!.click();
    expect(chosen).toEqual([20]);
  });
});
