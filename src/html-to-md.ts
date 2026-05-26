/**
 * Tiny HTML → Markdown converter for the four tags that actually appear
 * in 80k `description_short` (verified exhaustively across all jobs):
 *   <p>, <ul>, <li>, <a href="...">
 *
 * No nested lists in real data, but we handle one level of nesting defensively.
 */
export function htmlFragmentToMarkdown(html: string): string {
  if (!html.trim()) return "";

  // Normalize whitespace inside the HTML so the regex tokenizer is simpler.
  let s = html
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n+/g, "\n")
    .trim();

  // Convert <a href="X">text</a> first since they sit inside <p>/<li>.
  s = s.replace(
    /<a\s+[^>]*href=(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi,
    (_m, hrefDouble: string | undefined, hrefSingle: string | undefined, text: string) => {
      const href = hrefDouble ?? hrefSingle ?? "";
      const cleaned = decodeEntities(stripTags(text)).trim();
      return `[${cleaned}](${href.trim()})`;
    },
  );

  const blocks: string[] = [];
  const re = /<(p|ul)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  let lastIdx = 0;
  while ((m = re.exec(s))) {
    // Any plain text between tags becomes a paragraph too.
    const between = s.slice(lastIdx, m.index).trim();
    if (between) blocks.push(asParagraph(between));

    const tag = m[1]!.toLowerCase();
    const inner = m[2]!;
    if (tag === "p") {
      blocks.push(asParagraph(inner));
    } else {
      blocks.push(asList(inner));
    }
    lastIdx = re.lastIndex;
  }
  const trailing = s.slice(lastIdx).trim();
  if (trailing) blocks.push(asParagraph(trailing));

  return blocks.filter((b) => b.length > 0).join("\n\n");
}

function asParagraph(inner: string): string {
  return collapseWs(decodeEntities(stripTags(inner)));
}

function asList(inner: string): string {
  const items: string[] = [];
  const re = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner))) {
    items.push(`- ${collapseWs(decodeEntities(stripTags(m[1]!)))}`);
  }
  return items.join("\n");
}

function stripTags(s: string): string {
  return s.replace(/<\/?[^>]+>/g, "");
}

function collapseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}
