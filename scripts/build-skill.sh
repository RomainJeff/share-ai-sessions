#!/bin/sh
# Zips skills/share-session/ as share-session.skill (root folder share-session/) into dist/, served by the Worker.
set -eu
cd "$(dirname "$0")/.."
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
cp -R skills/share-session "$stage/share-session"
mkdir -p dist
rm -f dist/share-session.skill
(cd "$stage" && zip -qrX - share-session) > dist/share-session.skill
