/** Portable transcript adapters, shared by the CLI and Worker reader. No runtime dependencies. */
export type Line = Record<string, any>;
export type Harness = "claude" | "codex";
export const harnessOf = (lines: Line[]): Harness => lines.some(l => l.type === "session_meta" && l.payload?.id) ? "codex" : "claude";
/** Apply Codex compaction snapshots before a cross-harness resume. */
export function resumeHistory(lines: Line[]): Line[] {
  let history: Line[] = [];
  for (const line of lines) {
    if (line.type === "compacted" && Array.isArray(line.payload?.replacement_history)) {
      history = line.payload.replacement_history.map((payload: Line) => ({ type: "response_item", timestamp: line.timestamp, payload }));
    } else history.push(line);
  }
  return history;
}
const stringify = (v: unknown): string => typeof v === "string" ? v : JSON.stringify(v) ?? "";

/** Codex response_item is authoritative; event_msg duplicates are deliberately ignored. */
export function readerLine(line: Line): Line | undefined {
  if (line.type === "user" || line.type === "assistant") return line;
  const p = line.payload;
  if (line.type === "compacted") {
    const summary = p?.message || (p?.replacement_history ?? []).filter((item: Line) => item.type === "message")
      .flatMap((item: Line) => (item.content ?? []).map((b: Line) => b.text ?? "")).join("\n");
    if (summary) return { type: "user", isMeta: true, timestamp: line.timestamp, message: { content: summary } };
    return;
  }
  if (line.type !== "response_item" || !p) return;
  const row = (type: string, content: unknown, isMeta = false): Line => ({ type, timestamp: line.timestamp, isMeta, message: { role: type, content } });
  if (p.type === "additional_tools") return;
  if (p.type === "message") {
    const content = (p.content ?? []).map((b: Line) => {
      if (b.type === "input_text" || b.type === "output_text") return { type: "text", text: b.text };
      if (b.type === "input_image") return { type: "image", source: { type: "url", url: b.image_url } };
      return b;
    });
    return row(p.role === "assistant" ? "assistant" : "user", content, p.role !== "user" && p.role !== "assistant");
  }
  if (p.type === "function_call" || p.type === "custom_tool_call") {
    let input = p.arguments ?? p.input;
    try { input = JSON.parse(input); } catch { /* Custom tool input is free text. */ }
    return row("assistant", [{ type: "tool_use", id: p.call_id, name: p.name, input }]);
  }
  if (p.type === "function_call_output" || p.type === "custom_tool_call_output") return row("user", [{ type: "tool_result", tool_use_id: p.call_id, content: p.output }]);
  if (p.type === "reasoning") return row("assistant", (p.summary ?? []).map((b: Line) => ({ type: "thinking", thinking: b.text })));
  // Preserve less common tool records visibly rather than silently losing them.
  if (p.type !== "reasoning") return row("assistant", [{ type: "text", text: `[${p.type}] ${stringify(p)}` }]);
}

/** Cross-harness tools become historical text: the destination has a different tool registry. */
export function portableContent(value: unknown): Line[] {
  if (typeof value === "string") return [{ type: "text", text: value }];
  if (!Array.isArray(value)) return [{ type: "text", text: stringify(value) }];
  return value.flatMap((b: Line) => {
    if (b.type === "thinking" || b.type === "redacted_thinking") return [];
    if (b.type === "text" || b.type === "image") return [b];
    return [{ type: "text", text: `[Historical ${b.type}] ${stringify(b)}` }];
  });
}
