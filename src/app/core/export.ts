import { Paper } from './models';

/**
 * Quotes a CSV cell, and neutralises values that spreadsheet apps would run as formulas
 * (a title starting with "=" or "+" must not become a live formula when opened in Excel).
 */
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function papersToCsv(papers: readonly Paper[]): string {
  const header = ['Title', 'Authors', 'Year', 'Publisher', 'Type', 'DOI', 'Citations', 'PDF', 'CORE page', 'Abstract'];
  const rows = papers.map((p) => [
    p.title,
    p.authors.join('; '),
    p.year,
    p.publisher,
    p.documentType,
    p.doi,
    p.citationCount,
    p.links.find((l) => l.kind === 'pdf')?.url ?? null,
    p.coreUrl,
    p.abstract,
  ]);
  // Excel needs the BOM to read UTF-8 (accents in author names) correctly.
  return '﻿' + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

function bibEscape(text: string): string {
  return text.replace(/[\\{}]/g, (c) => `\\${c}`).replace(/([&%$#_])/g, '\\$1');
}

function citeKey(paper: Paper, used: Set<string>): string {
  const surname = (paper.authors[0] ?? 'anon').split(/[\s,]+/).filter(Boolean)[0] ?? 'anon';
  const word = paper.title.split(/\s+/).find((w) => w.length > 3) ?? 'paper';
  const base =
    `${surname}${paper.year ?? ''}${word}`.normalize('NFKD').replace(/[^A-Za-z0-9]/g, '').toLowerCase() || `core${paper.id}`;
  let key = base;
  for (let n = 2; used.has(key); n++) key = `${base}${n}`;
  used.add(key);
  return key;
}

export function papersToBibtex(papers: readonly Paper[]): string {
  const used = new Set<string>();
  return papers
    .map((p) => {
      const fields: [string, string | null][] = [
        ['title', `{${bibEscape(p.title)}}`],
        ['author', p.authors.length ? `{${p.authors.map(bibEscape).join(' and ')}}` : null],
        ['year', p.year ? `{${p.year}}` : null],
        ['publisher', p.publisher ? `{${bibEscape(p.publisher)}}` : null],
        ['doi', p.doi ? `{${bibEscape(p.doi)}}` : null],
        ['url', `{${p.links.find((l) => l.kind === 'pdf')?.url ?? p.coreUrl}}`],
        ['note', `{CORE ID ${p.id}}`],
      ];
      const body = fields
        .filter((f): f is [string, string] => f[1] !== null)
        .map(([k, v]) => `  ${k} = ${v}`)
        .join(',\n');
      return `@article{${citeKey(p, used)},\n${body}\n}`;
    })
    .join('\n\n');
}

export function exportFilename(label: string, extension: string, date = new Date()): string {
  const slug =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'papers';
  return `${slug}-${date.toISOString().slice(0, 10)}.${extension}`;
}

export function downloadText(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
