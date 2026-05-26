import { describe, it, expect } from "vitest";
import { htmlFragmentToMarkdown } from "../src/html-to-md.ts";

describe("htmlFragmentToMarkdown", () => {
  it("returns empty string for empty input", () => {
    expect(htmlFragmentToMarkdown("")).toBe("");
    expect(htmlFragmentToMarkdown("   ")).toBe("");
  });

  it("converts a single <ul> of <li>s to a markdown list", () => {
    const html = "<ul>\n<li>First item</li>\n<li>Second item</li>\n</ul>";
    expect(htmlFragmentToMarkdown(html)).toBe("- First item\n- Second item");
  });

  it("converts <p> to a paragraph", () => {
    expect(htmlFragmentToMarkdown("<p>Hello world.</p>")).toBe("Hello world.");
  });

  it("converts <a href> inside <li> to inline markdown link", () => {
    const html = '<ul><li>See <a href="https://example.com">the docs</a> for details.</li></ul>';
    expect(htmlFragmentToMarkdown(html)).toBe(
      "- See [the docs](https://example.com) for details.",
    );
  });

  it("handles multiple blocks separated by blank lines", () => {
    const html = "<p>Intro paragraph.</p><ul><li>one</li><li>two</li></ul>";
    expect(htmlFragmentToMarkdown(html)).toBe("Intro paragraph.\n\n- one\n- two");
  });

  it("decodes basic HTML entities", () => {
    expect(htmlFragmentToMarkdown("<p>A &amp; B</p>")).toBe("A & B");
    expect(htmlFragmentToMarkdown("<p>&quot;hi&quot;</p>")).toBe('"hi"');
  });

  it("handles single-quoted href", () => {
    const html = "<p>See <a href='https://x.com'>x</a>.</p>";
    expect(htmlFragmentToMarkdown(html)).toBe("See [x](https://x.com).");
  });

  it("real fixture sample shape", () => {
    // From a real 80k job description_short
    const html =
      "<ul>\n<li>In this role, you'll support FPF's US Policy team.</li>\n<li>Research the impact of new technologies in areas like AI.</li>\n</ul>";
    expect(htmlFragmentToMarkdown(html)).toBe(
      "- In this role, you'll support FPF's US Policy team.\n- Research the impact of new technologies in areas like AI.",
    );
  });
});
