#!/usr/bin/env bash
# Build and publish dist/ to the gh-pages branch (free GitHub Pages hosting).
set -euo pipefail
cd "$(dirname "$0")/.."

npm run build
touch dist/.nojekyll

TMP=$(mktemp -d)
cp -R dist/. "$TMP"/
cd "$TMP"
git init -q && git checkout -q -b gh-pages
git add -A
git -c user.email=ethangrucza@gmail.com -c user.name="Ethan1416" commit -qm "Deploy $(date +%F\ %T)"
git remote add origin https://github.com/Ethan1416/homehub.git
git push -qf origin gh-pages
cd - >/dev/null
rm -rf "$TMP"
echo "Deployed → https://ethan1416.github.io/homehub/"
