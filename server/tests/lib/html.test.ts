import { describe, expect, it } from 'vitest';
import { htmlToText } from '../../src/lib/html.js';

describe('htmlToText', () => {
  it('keeps paragraphs and turns list items into bullets', () => {
    expect(htmlToText('<p>Hi</p><ul><li>a</li><li>b</li></ul>')).toBe('Hi\n• a\n• b');
  });

  it('turns <br> into newlines and drops scripts', () => {
    expect(htmlToText('one<br>two<script>alert(1)</script>')).toBe('one\ntwo');
  });

  it('decodes entities and collapses blank runs', () => {
    expect(htmlToText('<p>A&nbsp;&amp;&nbsp;B</p><p></p><p></p><p></p><p>C</p>')).toBe('A & B\n\nC');
  });
});
