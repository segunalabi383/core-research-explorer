import { Pipe, PipeTransform } from '@angular/core';
import { Segment, highlightSegments } from '../core/highlight';

/** `text | highlight: terms` → segments the template renders as text and <mark>. */
@Pipe({ name: 'highlight' })
export class HighlightPipe implements PipeTransform {
  transform(text: string | null | undefined, terms: readonly string[]): Segment[] {
    return highlightSegments(text ?? '', terms);
  }
}
