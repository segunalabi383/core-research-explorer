import { HttpErrorResponse } from '@angular/common/http';

/** Resources wrap what a stream throws, so look one level down for the HTTP error. */
function findHttpError(error: unknown): HttpErrorResponse | null {
  if (error instanceof HttpErrorResponse) return error;
  const cause = (error as { cause?: unknown } | null)?.cause;
  return cause instanceof HttpErrorResponse ? cause : null;
}

/** CORE sends e.g. "2026-11-20T03:09:06+0000"; some parsers need the colon in the offset. */
export function retryTime(raw: string | null | undefined, now = Date.now()): Date | null {
  if (!raw) return null;
  if (/^\d+$/.test(raw.trim())) return new Date(now + Number(raw) * 1000);
  const date = new Date(raw.trim().replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A failed request, in words a person can act on. */
export function describeError(error: unknown): string {
  const http = findHttpError(error);
  if (!http) return 'Something went wrong while talking to CORE. Please try again.';
  const serverMessage = typeof http.error === 'object' && typeof http.error?.error === 'string' ? http.error.error : null;

  switch (http.status) {
    case 0:
      return "Couldn't reach the server. Check your connection and try again.";
    case 400:
    case 422:
      return serverMessage ?? "CORE couldn't understand that query. Check the brackets, quotes and AND/OR/NOT.";
    case 401:
    case 403:
      return 'CORE rejected the API key. The site owner needs to check CORE_API_KEY on the server.';
    case 429: {
      const when = retryTime(http.headers?.get('x-ratelimit-retry-after') ?? http.headers?.get('retry-after'));
      const at = when ? ` Searching resumes at ${when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.` : ' Please wait a minute and try again.';
      return `Too many searches in a short time.${at}`;
    }
    case 502:
      return "Couldn't reach CORE right now. Please try again shortly.";
    case 504:
      return 'CORE took too long to answer. Try again, or try a narrower query.';
    default:
      return http.status >= 500
        ? `CORE is having trouble right now (error ${http.status}). Please try again shortly.`
        : `The request failed (error ${http.status}).`;
  }
}
