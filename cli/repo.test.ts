import assert from "node:assert/strict";
import { test } from "node:test";
import { detectRepo, normalizeRemote } from "../skills/share-session/scripts/repo.ts";

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

test("detectRepo falls back to the cwd basename", () => {
  assert.equal(detectRepo("/nonexistent/My-Project"), "my-project");
});
