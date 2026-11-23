# CORE Research Explorer

An Angular app for searching, reading and analysing open-access research papers from the
[CORE API v3](https://api.core.ac.uk/docs/v3). Type a keyword or a full boolean query such as
`(drone AND (package OR delivery))`, choose how many papers to show per page, and see when every
matching paper was published.

It runs as one small product: an Angular 22 front end plus a dependency-free Node server that
keeps the CORE API key private.

## Features

**Search**
- Boolean search with `AND`, `OR`, `NOT`, brackets, `"exact phrases"`, field filters (`title:`,
  `authors:`) and numeric comparisons (`yearPublished>2020`).
- Queries are sent in the form CORE reads correctly. CORE ignores an OR group inside other
  brackets, so the brief's example `(drone AND (package OR delivery))` would otherwise match every
  drone paper. The app says when it adjusted a query, and why.
- The query is checked before it is sent. Unbalanced brackets, unclosed quotes and dangling
  operators get a precise message instead of a failed request. Lowercase `and`/`or`/`not` gets a hint.
- Choose 10, 25, 50 or 100 papers per page, or any custom number from 1 to 100.
- Numbered pagination through CORE's first 10,000 matches. Changing the page size keeps your place.
- Recent searches as one-click chips; press <kbd>/</kbd> anywhere to jump to the search box.

**Results**
- Paper cards with title, authors, year, type, publisher, citation count, an abstract you can
  expand, and PDF, DOI and CORE links.
- Search terms are highlighted in titles and abstracts (excluded `NOT` terms are not).
- CORE's messy metadata is cleaned: HTML and escaped markup in abstracts become plain text,
  duplicate authors and records are removed, and only `http(s)` links are ever rendered.

**Publication-year chart**
- Counts **every** paper that matches the query, using CORE's aggregate endpoint, not just the page on screen.
- Click a bar (or press Enter on it) to filter the results to that year; click again to clear.
- Hover or keyboard focus shows exact counts; a table view gives the same data accessibly.
- Shows the last 30 years by default with an *All years* toggle, and reports how many matches
  have no usable publication year.

**Keeping and sharing**
- Reading list saved in the browser, exportable as BibTeX or CSV. Copy a single paper's BibTeX in one click.
- Export the current page as CSV (safe to open in Excel: cells that look like formulas are neutralised).
- Every search, page, page size and year filter is in the address bar, so links can be shared
  and Back/Forward work.
- Light and dark themes, responsive down to phone width, full keyboard support.

**Production concerns**
- The CORE API key lives only on the server. The browser talks to `/api/*` on the same origin.
- The server validates every parameter, caches identical answers for 5 minutes, merges identical
  requests that arrive together, rate-limits each visitor, times out slow upstream calls, and
  passes CORE's rate-limit reset time through so the app can say when searching resumes.
- Errors are explained in plain language with a retry button; the year chart retries independently.

## Quick start

Requirements: **Node.js 22.12 or newer** and npm.

```bash
npm install
cp .env.example .env      # optional: add your CORE_API_KEY
npm start
```

Open <http://localhost:4200>. `npm start` runs the API server (port 3000) and the Angular dev server
together; the dev server forwards `/api/*` to the API server.

**API key.** The app works without a key, using CORE's anonymous access, which has a low rate
limit. For regular use, register for a free key at <https://core.ac.uk/services/api> and put it
in `.env` as `CORE_API_KEY=...`. The `.env` file is git-ignored.

## Build and run in production

```bash
npm run build             # builds the app into dist/
npm run serve:prod        # serves the app and the API on http://localhost:3000
```

Set `CORE_API_KEY` (and optionally `PORT`) in the environment of your host. One Node process serves
everything, so any Node host works (Render, Railway, Fly.io, a VM).

With Docker:

```bash
docker build -t core-research-explorer .
docker run -p 3000:3000 -e CORE_API_KEY=your_key core-research-explorer
```

## Tests

```bash
npm test                  # Angular unit and component tests (Vitest)
npm run test:server       # API server tests (Node's built-in test runner)
npm run verify            # all tests, then a production build
```

No test calls the real CORE API: the server tests use a fake upstream and the app tests use
Angular's HTTP testing controller. GitHub Actions runs `npm run verify` on every push.

## How it fits together

```text
Browser (Angular 22, zoneless, signals)
  │   GET /api/search?q=…&limit=…&offset=…
  │   GET /api/years?q=…
  ▼
server/core-proxy.mjs  (Node, no dependencies)
  │   validates → cache → rate limit → adds "Authorization: Bearer <key>"
  ▼
CORE API v3
    GET  /v3/search/works/
    POST /v3/search/works/aggregate   { aggregations: ["yearPublished"] }
```

```text
src/app/
  core/                   framework-light logic, all unit tested
    search.store.ts       all search state as signals, synced with the address bar
    api.service.ts        calls /api/*, returns normalised data
    normalize.ts          turns raw CORE records into safe Paper objects
    query.ts              boolean query checker and highlight terms
    chart-data.ts         chart layout maths
    export.ts             CSV and BibTeX
    url-state.ts, paging.ts, errors.ts, highlight.ts
    reading-list / history / theme services (localStorage, never throws)
  components/             search panel, paper card, year chart, pager, reading list, header
server/
  core-proxy.mjs          the API server (also serves the built app in production)
  index.mjs, dev.mjs      production and development entry points
```

### Design decisions

- **A server, not a browser-side key.** Putting the key in an Angular environment file ships it to
  every visitor. A 300-line server removes that risk and adds caching and rate limiting.
- **Year chart from the aggregate endpoint.** The brief asks for a chart of *all* papers matching
  the query. Counting only the 10–100 papers on screen would describe the page, not the query.
- **Working around CORE's query quirks.** CORE silently ignores an OR group that sits inside
  other brackets: `(drone AND (package OR delivery))`, the brief's own example, returns all
  71,213 drone papers, while `drone AND (package OR delivery)` correctly returns 4,729. CORE also
  fails on a query that is only a quoted phrase. The app removes brackets that enclose the whole
  query, brackets a lone phrase, warns about deeper nesting, and tells the person what it sent.
  The address bar keeps the query exactly as typed. (Found by Kpono Akpabio's submission and
  verified against the live API.)
- **Year filter as a query, not a client-side filter.** Clicking a year adds
  `AND yearPublished:Y` at the top level of the query, never nesting an OR group, so filtered
  results page correctly through every match from that year. For the rare query where that is
  impossible, year filtering is switched off and the chart says why.
- **Highlighting without `innerHTML`.** Text is split into segments and rendered with normal
  interpolation, so a paper title containing markup can never run as HTML.
- **Requests as resources.** Search results and year counts are `rxResource`s keyed on the search
  state. A newer search cancels the older request automatically, so stale results never appear.

## Limitations

- CORE's simple search pages through the first 10,000 matches only; the app says so when it applies.
- Without an API key, CORE allows only a few searches per minute. The app shows when it can search again.
- Year counts come from CORE's `yearPublished` field; records without one are reported, not guessed.
