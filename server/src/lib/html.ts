import * as cheerio from 'cheerio';

export function htmlToText(html: string): string {
  const $ = cheerio.load(`<div id="root">${html}</div>`, {}, false);
  $('script,style').remove();
  $('br').replaceWith('\n');
  $('p,div,h1,h2,h3,h4,h5,h6,tr').each((_, el) => {
    $(el).append('\n');
  });
  $('li').each((_, el) => {
    $(el).prepend('• ').append('\n');
  });
  return $('#root')
    .text()
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
