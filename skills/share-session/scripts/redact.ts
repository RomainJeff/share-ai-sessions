import { ClientError } from './lib.ts';

export type RedactionOptions = { stripThinking?: boolean; stripToolResults?: boolean };

// Deliberately deterministic: sync must produce the same sanitized bytes for the same source.
const PATTERNS: [string, RegExp][] = [
  ['private-key', /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----/g],
  ['aws', /\b(?:AKIA|ASIA|AIDA|AROA)[A-Z0-9]{16}\b/g],
  ['gcp', /\bAIza[\w-]{35}\b/g],
  ['anthropic', /\bsk-ant-[A-Za-z0-9_-]{20,}/g],
  ['openai', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/g],
  ['slack', /\bxox[baprs]-[A-Za-z0-9-]{10,}/g],
  ['github', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g],
  ['jwt', /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g],
  ['credential', /\b[a-z][a-z0-9+.-]*:\/\/[^/\s"'<>]+:[^/\s"'<>]*@/gi],
  ['credential', /\b(?:Bearer|Basic)\s+(?!\[REDACTED:)[A-Za-z0-9_~+/.=-]+/gi],
  ['skills-config', /(?:[A-Za-z]:)?(?:[\/\\][^\s"'<>`\/\\]+)*[\/\\]?\.agents[\/\\]skills-config(?:[\/\\][^\s"'<>`]+)?/g],
];
const CREDENTIAL_KEY = /^(?:.*[_-])?(?:key|token|secret|password|passwd|pwd|credential|credentials|authorization|cookie)(?:[_-].*)?$/i;
const MARKER = /^\[REDACTED:[a-z-]+\]$/;

/** Scan every string (including attachments/rendered), retaining every JSONL line and link. */
export function redactJsonl(jsonl: string, options: RedactionOptions = {}) {
  const replacements: Record<string, number> = {};
  let lines = 0;
  let thinkingRemoved = 0;
  let toolResultsStripped = 0;
  const mask = (kind: string) => {
    replacements[kind] = (replacements[kind] ?? 0) + 1;
    return `[REDACTED:${kind}]`;
  };
  function text(value: string): string {
    for (const [kind, regex] of PATTERNS) value = value.replace(regex, () => mask(kind));
    // dotenv assignments, including generic KEY=..., and named credentials in prose/embedded JSON.
    value = value.replace(/((?:\bexport\s+)?["']?([A-Za-z_][A-Za-z0-9_-]*)["']?\s*=\s*)("(?:\\[\s\S]|[^"\\])*(?:"|$)|'(?:\\[\s\S]|[^'\\])*(?:'|$)|[^\s,;}"']+)/g,
      (whole, prefix: string, key: string, raw: string) => {
        if (!CREDENTIAL_KEY.test(key.replace(/([a-z0-9])([A-Z])/g, '$1_$2')) && !(/^[A-Z_][A-Z0-9_]*$/.test(key) && prefix.includes('='))) return whole;
        const quoted = raw.startsWith('"') || raw.startsWith("'");
        const val = quoted ? raw.slice(1, -1) : raw;
        if (MARKER.test(val)) return whole;
        const replacement = mask('env');
        return prefix + (quoted ? raw[0] + replacement + raw[0] : replacement);
      });
    value = value.replace(/(["']?(?:[A-Za-z0-9]+[_-])*(?:key|token|secret|password|passwd|pwd|credentials?|authorization|cookie)(?:[_-][A-Za-z0-9]+)*["']?\s*:\s*)("(?:\\[\s\S]|[^"\\])*(?:"|$)|'(?:\\[\s\S]|[^'\\])*(?:'|$)|[^\s,;}"']+)/gi,
      (whole, prefix: string, raw: string) => {
        const quoted = raw.startsWith('"') || raw.startsWith("'");
        if (MARKER.test(quoted ? raw.slice(1, -1) : raw)) return whole;
        const replacement = mask('env');
        return prefix + (quoted ? raw[0] + replacement + raw[0] : replacement);
      });
    return value;
  }
  function visit(value: any): any {
    if (typeof value === 'string') return text(value);
    if (Array.isArray(value)) return value.map(visit).filter(v => v !== undefined);
    if (!value || typeof value !== 'object') return value;
    const thinking = /^(thinking|redacted_thinking|reasoning|agent_reasoning(?:_raw_content)?)$/i.test(value.type ?? '');
    if (thinking && options.stripThinking) {
      thinkingRemoved++;
      return undefined;
    }
    if ((value.type === 'function_call_output' || value.type === 'custom_tool_call_output') && options.stripToolResults) {
      toolResultsStripped++;
      value = { ...value, output: '[REDACTED:tool-result]' };
    }
    if (options.stripToolResults && ['exec_command_end', 'patch_apply_end', 'mcp_tool_call_end', 'dynamic_tool_call_response', 'CommandExecution', 'McpToolCall', 'DynamicToolCall', 'FileChange', 'FunctionCallOutput'].includes(value.type)) {
      toolResultsStripped++;
      value = { ...value };
      for (const key of ['stdout', 'stderr', 'aggregated_output', 'result', 'content', 'output']) {
        if (key in value) value[key] = '[REDACTED:tool-result]';
      }
    }
    if (value.type === 'tool_result' && options.stripToolResults) {
      toolResultsStripped++;
      // Retain the block and tool_use_id so pairing survives a read-only export.
      value = { ...value, content: '[REDACTED:tool-result]' };
    }
    if (value.type === 'reasoning' && value.encrypted_content) {
      value = { ...value };
      delete value.encrypted_content;
      thinkingRemoved++;
    }
    const output: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      const clean = options.stripToolResults && key === 'toolUseResult' ? '[REDACTED:tool-result]'
        : CREDENTIAL_KEY.test(key.replace(/([a-z0-9])([A-Z])/g, '$1_$2')) && typeof val === 'string' && val && !MARKER.test(val) ? mask('env') : visit(val);
      if (clean !== undefined) output[text(key)] = clean;
    }
    if (thinking && JSON.stringify(output) !== JSON.stringify(value)) {
      thinkingRemoved++;
      return undefined; // never edit a signed thinking block
    }
    return output;
  }
  const sanitized = jsonl.split('\n').map((raw, index) => {
    if (!raw.trim()) return raw;
    let line: unknown;
    try {
      line = JSON.parse(raw);
      if (!line || typeof line !== 'object' || Array.isArray(line)) throw new Error();
    } catch {
      // Never quote the unsafe line (or JSON.parse's error) in diagnostics.
      throw new ClientError('invalid_jsonl', `Invalid JSONL object at line ${index + 1}; retry after the transcript finishes writing`);
    }
    lines++;
    return JSON.stringify(visit(line) ?? {});
  }).join('\n');
  return { jsonl: sanitized, lines, replacements, thinking_removed: thinkingRemoved, tool_results_stripped: toolResultsStripped };
}
