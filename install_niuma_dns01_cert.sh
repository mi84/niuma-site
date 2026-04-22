#!/bin/sh
set -eu

ACME_BIN="/usr/lib/acme/client/acme.sh"
ACME_HOME="${ACME_HOME:-/etc/ssl/acme}"
CERT_DIR="${CERT_DIR:-/etc/nginx/certs/niuma.ru}"

[ -x "$ACME_BIN" ]
mkdir -p "$CERT_DIR"

"$ACME_BIN" \
  --home "$ACME_HOME" \
  --install-cert \
  -d niuma.ru \
  --key-file "$CERT_DIR/privkey.pem" \
  --fullchain-file "$CERT_DIR/fullchain.pem" \
  --reloadcmd "/etc/init.d/nginx restart"
