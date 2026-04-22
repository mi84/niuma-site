#!/bin/sh
set -eu

ACME_BIN="/usr/lib/acme/client/acme.sh"
ACME_HOME="${ACME_HOME:-/etc/ssl/acme}"
ACCOUNT_EMAIL="${1:-}"

[ -x "$ACME_BIN" ]
[ -n "$ACCOUNT_EMAIL" ]

mkdir -p "$ACME_HOME"

"$ACME_BIN" --home "$ACME_HOME" --register-account -m "$ACCOUNT_EMAIL" || true
"$ACME_BIN" \
  --home "$ACME_HOME" \
  --server letsencrypt \
  --issue \
  --dns \
  --yes-I-know-dns-manual-mode-enough-go-ahead-please \
  -d niuma.ru \
  -d www.niuma.ru
