import { Marked, Renderer, type Tokens } from "marked";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { escapeHtml as e } from "./ui";

for (const [name, lang] of Object.entries({ bash, css, diff, dockerfile, go, ini, javascript, json, markdown, php, python, rust, sql, typescript, xml, yaml })) hljs.registerLanguage(name, lang);
hljs.registerAliases(["sh", "shell", "zsh", "console"], { languageName: "bash" });
hljs.registerAliases(["ts", "tsx"], { languageName: "typescript" });
hljs.registerAliases(["js", "jsx", "mjs"], { languageName: "javascript" });
hljs.registerAliases(["html", "svg"], { languageName: "xml" });
hljs.registerAliases(["yml"], { languageName: "yaml" });
hljs.registerAliases(["toml"], { languageName: "ini" });

/** Only plain web links and in-page anchors survive; javascript:, data:, relative paths are dropped. */
const safeUrl = (href: string) => /^(https?:\/\/|mailto:|#)/i.test(href.trim()) ? href.trim() : null;

/** Highlighted code; hljs escapes its output, unknown languages fall back to escaped text. */
export function highlight(text: string, lang?: string): string {
  const language = lang && hljs.getLanguage(lang) ? lang : null;
  return language ? hljs.highlight(text, { language, ignoreIllegals: true }).value : e(text);
}

const md = new Marked({ gfm: true, breaks: true, renderer: {
  // Raw HTML from a transcript is text, never markup.
  html: ({ text }) => e(text),
  link({ href, title, tokens }) {
    const label = this.parser.parseInline(tokens);
    const url = safeUrl(href);
    return url ? `<a href="${e(url)}"${title ? ` title="${e(title)}"` : ""} rel="noopener noreferrer nofollow" target="_blank">${label}</a>` : label;
  },
  // CSP blocks remote images anyway: show the alt text, linked when the URL is safe.
  image({ href, text }) {
    const url = safeUrl(href);
    const label = `<span class="md-img">Image : ${e(text || href)}</span>`;
    return url ? `<a href="${e(url)}" rel="noopener noreferrer nofollow" target="_blank">${label}</a>` : label;
  },
  code({ text, lang }) {
    const name = (lang || "").match(/^\S*/)?.[0] ?? "";
    return `<div class="cb"><div class="cb-h"><span class="mono">${e(name || "texte")}</span><button class="copy" type="button" data-copy-code>Copier</button></div><pre><code>${highlight(text, name)}</code></pre></div>`;
  },
  table(token: Tokens.Table) { return `<div class="tblw">${Renderer.prototype.table.call(this, token)}</div>`; },
} });

/** GFM rendering for prompts and answers. */
export const markdownHtml = (text: string) => `<div class="md">${md.parse(text, { async: false })}</div>`;
