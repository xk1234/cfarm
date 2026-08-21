#!/usr/bin/env bash
# Cloud Agent install phase for LumenClip.
#
# Installs the system packages and project dependencies the development
# experience needs. This runs after the repository is checked out and, when
# environment builds are enabled, once to create the baseline snapshot. It must
# be idempotent and terminate; per-boot service startup lives in start.sh.
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

# System packages:
# - postgresql/-client: local Railway-compatible PostgreSQL (runtime source of truth)
# - ffmpeg: slideshow/video rendering used by lib/slideshows and rendi tooling
# - curl/ca-certificates: fetch the MinIO binaries below
sudo apt-get update -qq
sudo apt-get install -y -qq postgresql postgresql-client ffmpeg curl ca-certificates

# MinIO server + client provide an S3-compatible bucket standing in for the
# private Railway object store during local development.
if ! command -v minio >/dev/null 2>&1; then
  curl -fsSL https://dl.min.io/server/minio/release/linux-amd64/minio -o /tmp/minio
  sudo install -m 0755 /tmp/minio /usr/local/bin/minio
fi
if ! command -v mc >/dev/null 2>&1; then
  curl -fsSL https://dl.min.io/client/mc/release/linux-amd64/mc -o /tmp/mc
  sudo install -m 0755 /tmp/mc /usr/local/bin/mc
fi

# Project dependencies (pnpm version is pinned via package.json packageManager).
corepack enable
pnpm install --frozen-lockfile

# Cursor agents authenticate with the project-scoped RAILWAY_TOKEN secret.
# Install the official CLI so they can inspect logs and deploy this project.
if ! command -v railway >/dev/null 2>&1; then
  sudo npm install --global @railway/cli
fi
railway --version
