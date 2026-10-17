/** Hash the last stored line, including its newline, for the client's prefix guard. */
export async function lastLineHash(bytes: Uint8Array): Promise<string> {
  const end = bytes.length;
  let start = end > 0 && bytes[end - 1] === 10 ? end - 2 : end - 1;
  while (start >= 0 && bytes[start] !== 10) start--;
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice(start + 1));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
