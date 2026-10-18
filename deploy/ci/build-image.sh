#!/bin/bash
# Builds the web image of confera_fe as an OCI archive, with its digest (M4-FE-05; ADR-27).
#
#   deploy/ci/build-image.sh <output directory> <revision>
#
# Run by the build job of .github/workflows/image.yml, which holds no credential of any kind. The
# publish job copies the archive to the registry unchanged (skopeo --preserve-digests), so the
# digest printed here is the digest a server pulls. The archive is also loaded into the local
# Docker as confera-m4-infra-web:check, so that deploy/checks/image.mjs checks exactly that image.
#
# Writes <output>/digests.env: CONFERA_WEB_DIGEST.
set -euo pipefail

out=${1:?usage: build-image.sh <output directory> <revision>}
revision=${2:?usage: build-image.sh <output directory> <revision>}
mkdir -p "$out"

docker buildx build --platform linux/amd64 --provenance=false --sbom=false \
  --build-arg "CONFERA_REVISION=$revision" \
  --output "type=oci,dest=$out/web.tar,name=confera-m4-infra-web:check" .

digest=$(tar -xOf "$out/web.tar" index.json | node -e '
  let text = ""; process.stdin.on("data", (c) => (text += c)).on("end", () => {
    const index = JSON.parse(text);
    if (index.manifests.length !== 1) { console.error("expected one manifest"); process.exit(1); }
    process.stdout.write(index.manifests[0].digest);
  });')
[[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "no digest for the web image" >&2; exit 1; }

docker load --input "$out/web.tar"
printf 'CONFERA_WEB_DIGEST=%s\n' "$digest" >"$out/digests.env"
cat "$out/digests.env"
