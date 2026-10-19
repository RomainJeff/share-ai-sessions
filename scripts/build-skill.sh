#!/bin/sh
# Zips skills/share-session/ as share-session.skill (root folder share-session/) into dist/, served by the Worker.
# SESSION_SHARE_BASE_URL and SESSION_SHARE_BROKER_URL, when set, are baked in as the skill's config.json.
set -eu
cd "$(dirname "$0")/.."
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
cp -R skills/share-session "$stage/share-session"
rm -f "$stage/share-session/config.json"
if [ -n "${SESSION_SHARE_BASE_URL:-}" ]; then
  printf '{ "baseUrl": "%s", "brokerUrl": "%s" }\n' "$SESSION_SHARE_BASE_URL" "${SESSION_SHARE_BROKER_URL:?set it with SESSION_SHARE_BASE_URL}" > "$stage/share-session/config.json"
fi
mkdir -p dist
rm -f dist/share-session.skill
(cd "$stage" && zip -qrX - share-session) > dist/share-session.skill
