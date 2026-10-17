---
name: share-session
description: Share a Claude Code session (JSONL) on Claude Session Share into a project you pick, list shared sessions by project, repo, author or title, sync new lines, stop syncing a session, or create projects and manage who can read or write them.
---

# Share Session

Uploads Claude Code session transcripts to `sessions.example.com` (Cloudflare Worker behind Access) and lists them. Every call goes through the deterministic client:

```bash
node <skill dir>/scripts/client.ts <command>
```

`<skill dir>` is this skill's base directory (shown when the skill loads). The client is self-contained: Node 24+ runs the TypeScript directly, no `npm install`, no dependency.

It prints one JSON result on stdout. On failure it prints safe JSON on stderr and exits 1.

## Install (any machine)

Install with `npx skills add RomainJeff/share-ai-sessions` (needs read access to that GitHub repo), or download `share-session.skill` from the reader's home page (https://sessions.example.com, behind Access) and add it in Claude, or unzip it into `~/.claude/skills/` (or a repo's `.claude/skills/`). Alternatively copy or symlink this whole folder there. Requirements: Node 24+, `cloudflared`, and an email allowed by the Access policy.

## First use: guided setup

If `~/.claude/session-share/manifest.json` does not exist (never used on this machine), or any command fails with a setup error, run `doctor` before anything else and walk the user through each failure, one at a time, rerunning `doctor` after each fix:

| `doctor` result | Do |
|-----------------|----|
| `node_unsupported` | Tell the user Node 24+ is required (`node --version`); propose `brew install node` or their version manager. Stop until fixed |
| `cloudflared_missing` | Propose `brew install cloudflared`; run it only after a yes |
| `login_required` / `unauthorized` | Ask the user to run `cloudflared access login https://sessions.example.com` in their own terminal (browser SSO, you cannot do it). If it reports `no such host` while the domain resolves elsewhere, suggest flushing the macOS DNS cache: `sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder` |
| `forbidden` | Their email is not in the Access policy: ask the owner to add it. Nothing to fix locally |
| `invalid_config` | Show the override file path; propose deleting it (default URL works) |
| No `cloudflared` possible (cloud session, locked machine) | Use the MCP broker below instead |
| Success | Setup done. If it reports `stop_hook: false`, offer to install the Stop hook (see "Automatic sync at turn end") so shared sessions sync by themselves; install only on a yes |

Never run the login, type credentials, or read `~/.cloudflared/`. Setup ends at a green `doctor`; then continue with the user's original request.

## Config

- None required: the client targets `https://sessions.example.com`. To override, create `~/.claude/session-share/config.json` (or point `SESSION_SHARE_CONFIG` at a file) from `config.example.json` next to this file. It holds only `baseUrl`, no secret.
- Auth is the user's own Cloudflare Access identity via `cloudflared`: once per machine, `cloudflared access login https://sessions.example.com` in the user's terminal. The client then asks `cloudflared access token` on every call.

## MCP broker (without cloudflared)

- Connector: `https://sessions-mcp.example.com/mcp`, OAuth through the allowlisted Access OIDC app.
- Call `get_token({scope: "read"})` for list/read (sessions and projects), `get_token({scope: "write", session_id: "<lowercase UUID>"})` for upload/sync of one session, or `get_token({scope: "projects"})` for `project create`, `add` and `remove`. Another person's session cannot receive a write token. Roles still apply: a token never grants more than the user's role in the project.
- The response contains `token`, `expires_at`, `base_url`, and `command`. Execute the returned command, replacing `<share-session skill dir>` with this skill's base directory and `<path.jsonl>` for upload. `SESSION_TOKEN` makes the client use the MCP host API without local config or cloudflared.
- Tokens expire after 10 minutes. Keep them only in the command's environment prefix; never save them to files or config, or include them in user-facing output. `token_expired` means call `get_token` again; `invalid_token` means obtain a fresh token from this connector.
- Read scope cannot write; write scope can only upload/PATCH its session and cannot read or delete. Obtain a read token separately for read operations. Automatic cloud hooks and setup are T11.

## Projects and rights

Every session lives in exactly one **project**, chosen by the user, independent of the folder or repo it was worked in. The git `owner/repo` of the session cwd is still recorded as `repo` metadata.

| Role | Can |
|------|-----|
| `reader` | List, read in the browser, `pull` the project's sessions |
| `writer` | Reader + upload new sessions into the project and sync their own |
| `owner` | Writer + add, change or remove members |

- A session outside your projects does not exist for you: list, reader page, bundle and pull all answer "not found".
- **Choosing the project at upload.** Before the first `upload` of a session, run `project list` and ask the user which project it goes into, showing the projects where they are `writer` or `owner`. Suggest the one most related to the session's subject or repo, but let the user decide. If none fits, offer to create one (`project create <slug> --name "<name>"`) and do it only on a yes. Never pick silently.
- **Locked.** Once uploaded, a session stays in its project. Its re-uploads and syncs, its forks (`pull` then upload) and its compaction continuations go into the same project automatically: omit `--project`. The server refuses a different project (`bad_request: project is locked to …`).
- **Adding people.** `project add <slug> <email> --role reader|writer|owner` (default `reader`) also changes the role of an existing member. The person must also be allowed by the Cloudflare Access policy of `sessions.example.com`: remind the user, the client cannot do it. Run `add` and `remove` only when the user asked for that change, for that email.
- A project always keeps at least one owner. A member can leave a project with `project remove <slug> <own email>`.
- Sessions shared before projects existed are in the `legacy` project, whose owners are everyone who had uploaded at that time.

## Guardrails

- Run authenticated operations only through `client.ts`. Never reproduce its requests with `curl`, `fetch`, or handcrafted Access headers.
- Never write, print or quote an Access token. The client never stores one; `cloudflared` keeps its own cache in `~/.cloudflared/`.
- The session owner is the email in the verified token, never something you pass.
- `upload` scans every JSONL string (including attachments, rendered text and metadata) for secrets. Affected thinking blocks are removed; transcript lines and message links are retained. Regex scanning has limits: review the preview before sharing sensitive sessions.
- Run `upload <path.jsonl> --project <slug>` first: it returns a local preview (target project, lines, replacements by type, sanitized JSONL bytes) and a `confirmation` hash, without authenticating or sending anything. Show the preview, including the project, and obtain explicit user agreement, then repeat with the same flags and `--confirm <hash>`. Confirm sends exactly the previewed bytes, so the live current session can be shared: lines appended since the preview go out with the next `sync`. Any rewrite of previewed content or option change requires a fresh preview and agreement. Never treat the hash itself as user consent.

## Commands

| Command | Does |
|---------|------|
| `doctor` | Checks Node 24+, config, `cloudflared` token, API reachability, `claude --version`, `~/.claude/projects` |
| `upload <path.jsonl> [--project <slug>] [--strip-thinking] [--strip-tool-results] [--confirm <hash>]` | Previews, then uploads after consent. `--project` is required for a session's first upload (`project_required` otherwise) and omitted for re-uploads, forks and continuations, which inherit it. Strip flags remove thinking or inline tool-result payloads for a read-only share; keep the same flags when confirming. `repo` = `owner/repo` from the session cwd's `git remote get-url origin` (cwd basename otherwise) |
| `sync <id>` / `sync --all` | Send complete new lines, redacted with the upload's strip policy, for one opted-in session or every manifest entry. Server bytes/hash of the sanitized stream decide the offset; conflict or rewritten prefix triggers a full replacement |
| `stop <id>` / `stop current` | Remove the local manifest entry and record a stop tombstone, without deleting the remote session. Durable: hook and manual sync stay off until a new consented upload. Returns a `share-session:opt-out <id>` marker; keep it in the conversation. `current` requires `CLAUDE_SESSION_ID`; otherwise pass the id |
| `list [--project slug] [--repo owner/repo] [--author email] [--mine] [--q text]` | Live sessions (synced within 90 days) of your projects, newest first. Render as a compact table: id, title, project, repo, author, date, messages |
| `project list` | Your projects with your role, member and session counts |
| `project create <slug> [--name <name>]` | New project (`a-z`, `0-9`, inner dashes, 64 chars max), you become its owner |
| `project show <slug>` | Project and its members with their roles (members only) |
| `project add <slug> <email> [--role reader\|writer\|owner]` | Owners: add a member, or change their role. Default `reader` |
| `project remove <slug> <email>` | Owners: remove a member. Anyone: remove yourself |

The current session's transcript is `~/.claude/projects/<cwd with every non-alphanumeric char replaced by ->/<session id>.jsonl`.

## Stop hook check

`doctor` and a confirmed `upload` return `stop_hook`: whether `~/.claude/settings.json` or the project's `.claude/settings(.local).json` already runs `client.ts hook-stop` on Stop. When it is `false`, tell the user later lines will only go out with a manual `sync`, and offer once per conversation to add the hook (see "Automatic sync at turn end"). Edit the settings only after a yes. If they decline, do not offer again in that conversation.

## Manual sync

After a successful upload, keep the returned `share-session:opt-in <id> [--strip-…]` marker in the conversation (it carries the strip policy): CLI stdout is recorded in the calling Claude transcript. The client caches the id, transcript path, byte offset, last-line hash, strip policy and URL in `~/.claude/session-share/manifest.json`; it stores no token. If that cache disappears, a manual `sync <id>` can recover the transcript from `~/.claude/projects/*/<id>.jsonl` when its last `share-session:opt-in`/`opt-out` marker for that id is an opt-in; an opt-out after it means stopped (`not_found`). A stop tombstone in the manifest refuses with `stopped`. `sync --all` and the Stop hook only visit current cache entries.

Sync publishes complete lines and waits for an unfinished final line. It reads the server offset before sending, so a stale local manifest does not duplicate data. Upload consent covers subsequent manual syncs. The Stop hook is a separate ticket (T09).

## Browser reader

Open the configured app URL in the browser to filter sessions of your projects by project, repo, author, UTC update period, or title/summary. Open `/s/<id>` to read the whole conversation in a scrollable container opened at the latest messages, with collapsed tools and token usage deduplicated by `message.id`. Transcript content is displayed as text.

The **Reprendre** button copies `/share-session pull <id>` for use in Claude Code. The pull command is delivered by T05; the reader only copies the instruction.

## Errors

- `invalid_config`: fix or delete the override config file.
- `cloudflared_missing`: propose `brew install cloudflared`.
- `login_required` or `unauthorized`: ask the user to run `cloudflared access login https://sessions.example.com`, then rerun `doctor`.
- `project_required`: a first upload needs `--project <slug>`; ask the user which project (see "Projects and rights").
- `forbidden` on upload or sync: the session id already belongs to someone else, or the user is not `writer` on the project. The message says which.
- `forbidden` on `project add/remove`: only owners manage members.
- `not_found` on a session or project: it does not exist, or the user is not a member of its project.
- `bad_request: project is locked to …`: drop `--project`, the session inherits its project.
- `conflict`: the project slug is taken, or the change would leave the project without an owner.
- `confirmation_mismatch`: request a new preview and user agreement for the current content and options.
- `invalid_jsonl`: an incomplete or malformed line was refused without sending it; retry once the transcript finishes writing.

## Pull as a local fork (T05)

`pull <id> [--target terminal|desktop]` downloads the bundle with a read token and creates a fresh session UUID under the current cwd's terminal history. It remaps both raw and encoded cwd paths, removes thinking with parent re-chaining, restores bundled tool-results, and appends an `isMeta` context note with provenance and a reminder to re-check paths, access and environment. The result includes `command: "claude --resume <newId>"`; show it for the user to run in a new terminal.

The surface comes from `CLAUDE_CODE_ENTRYPOINT`; unknown/cloud entrypoints fall back to terminal. Desktop is pending HITL location/index verification and returns `unsupported_target`; use `--target terminal` to import to terminal history. No Desktop location is assumed.

Pull stores provenance in `manifest.forks` and leaves sync opt-in to a later consented upload. Upload the new transcript path using the normal preview/confirmation flow; in broker mode obtain a write token scoped to the **new** UUID. The client sends `forked_from`; the server validates that the original exists and derives its owner from D1. The fork stays in the original's project (the uploader needs `writer` there) and belongs to the uploader, and its detail page links back with “forké depuis”. The original remains intact.

## Automatic sync at turn end (local)

Install the Stop hook by merging the `hooks.Stop` entry from `hooks.example.json` (next to this file) into `~/.claude/settings.json`. Preserve all existing settings and hooks. The example assumes the skill lives in `~/.claude/skills/share-session/`; otherwise replace the path with this skill's absolute `scripts/client.ts`. Use Node 24+ on the hook's PATH. Installing the hook does not opt any session in: first complete the upload preview and consent flow above.

`hook-stop` reads Claude Code's Stop JSON from stdin. It syncs only sessions with a manifest entry: transcript markers are never consent for the hook, since pasted or tool-read text could contain one. Unshared or stopped sessions return immediately without authentication or network calls. Opted-in sessions sync complete, sanitized lines with their existing strip policy, silently. The hook exits 0; stdout is reserved for a Stop block decision rather than the CLI's usual JSON result.

After compaction, Claude Code continues the conversation under a new session id and JSONL that starts with the parent's `compact_boundary` line (same `uuid`). For an unshared, not stopped session whose transcript starts that way, the hook looks for that line in the shared transcripts. If a shared parent is found, it records `continuations[<id>]` in the manifest (only a "proposed once" mark, never consent) and blocks once with the matching `upload <path> [--strip-…]` command, which reuses the parent's strip policy. Ask the user whether to share the continuation too. Only if they say yes, run the preview, show it, and confirm with `--confirm <hash>` after their explicit agreement. The upload sends `continued_from`, the server accepts it only for a parent session the same user owns, and the reader shows "suite de …" / "suite dans …". If they decline, nothing is uploaded and the hook does not ask again.

If the local token is missing or expired, the hook returns `decision: block`: call `get_token({scope: "write", session_id: "<id>"})`, then run `SESSION_TOKEN=<token> node <skill dir>/scripts/client.ts sync <id>` (the hook's message gives the exact path). Keep the token only in the command environment. When `stop_hook_active` is true it never blocks again; other errors produce a short stderr message and let the turn finish. Cloud setup and end-to-end validation remain T10/T11.
