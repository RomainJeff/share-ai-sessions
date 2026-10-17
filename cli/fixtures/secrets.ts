// Synthetic values only; none of these credentials are usable.
export const secrets = [
  ['aws', 'AKIA' + 'A'.repeat(16)],
  ['aws', 'ASIA' + 'B'.repeat(16)],
  ['gcp', 'AIza' + 'C'.repeat(35)],
  ['anthropic', 'sk-ant-api03-' + 'D'.repeat(80)],
  ['openai', 'sk-proj-' + 'E'.repeat(80)],
  ['openai', 'sk-' + 'F'.repeat(48)],
  ['slack', 'xoxb-' + '123456789012-123456789012-abcdefghijklmnopqrstuvwx'],
  ['github', 'ghp_' + 'G'.repeat(36)],
  ['github', 'github_pat_' + 'H'.repeat(82)],
  ['jwt', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.ZmFrZXNpZ25hdHVyZQ'],
  ['private-key', '-----BEGIN RSA PRIVATE KEY-----\nFAKE PRIVATE MATERIAL\n-----END RSA PRIVATE KEY-----'],
  ['env', 'STRIPE_KEY=fixture-password'],
  ['skills-config', '/repo/.agents/skills-config/acme/runtime.json'],
] as const;

export const sessionId = '11111111-1111-4111-8111-111111111111';
export const records = [
  { type: 'user', sessionId, uuid: 'u1', parentUuid: null, cwd: '/nonexistent/project', message: { role: 'user', content: 'Keep CLAUDE.md and user@example.com. Bonjour été.' } },
  ...secrets.map(([kind, secret], i) => ({
    type: 'attachment', sessionId, uuid: `a${i}`, parentUuid: i ? `a${i - 1}` : 'u1',
    attachment: { type: 'prompt_snapshot', systemPrompt: `Org instructions. ${secret}`, nested: [secret] }, rendered: `${kind}: ${secret}`,
  })),
  { type: 'assistant', sessionId, uuid: 'thinking', parentUuid: 'a12', message: { id: 'm1', content: [{ type: 'thinking', thinking: secrets[3][1], signature: 'fake-signature' }] } },
  { type: 'assistant', sessionId, uuid: 'safe-thinking', parentUuid: 'thinking', message: { id: 'm2', content: [{ type: 'thinking', thinking: 'ordinary reasoning', signature: 'untouched-signature' }, { type: 'tool_use', id: 'tool1', name: 'Read', input: { file_path: 'note.txt' } }] } },
  { type: 'user', sessionId, uuid: 'result', parentUuid: 'safe-thinking', message: { content: [{ type: 'tool_result', tool_use_id: 'tool1', content: [{ type: 'text', text: secrets[1][1] }] }] }, toolUseResult: { stdout: 'tool output' } },
];
export const jsonl = records.map(r => JSON.stringify(r)).join('\n') + '\n';
