import assert from "node:assert/strict";
import { test } from "node:test";
import { detectProject, normalizeRemote } from "../../../.agents/skills/share-session/scripts/project.ts";

test("normalizeRemote handles every remote form", () => {
  for (const remote of [
    "git@github.com:Acme/Notes.git",
    "https://github.com/acme/notes",
    "https://github.com/acme/notes.git\n",
    "https://user:tok@github.com/acme/notes/",
    "ssh://git@github.com:22/acme/notes.git",
    "http://local_proxy@127.0.0.1:41235/git/acme/notes",
  ]) {
    assert.equal(normalizeRemote(remote), "acme/notes", remote);
  }
  assert.equal(normalizeRemote("not-a-remote"), null);
});

test("detectProject falls back to the cwd basename", () => {
  assert.equal(detectProject("/nonexistent/My-Project"), "my-project");
});
