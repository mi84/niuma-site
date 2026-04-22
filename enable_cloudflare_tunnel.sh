#!/bin/sh
set -eu

TOKEN="${1:-}"

[ -n "$TOKEN" ]

uci set cloudflared.config.enabled='1'
uci set cloudflared.config.token="$TOKEN"
uci set cloudflared.config.config='/etc/cloudflared/config.yml'
uci set cloudflared.config.protocol='http2'
uci set cloudflared.config.loglevel='info'
uci set cloudflared.config.logfile='/var/log/cloudflared.log'
uci commit cloudflared

/etc/init.d/cloudflared enable
/etc/init.d/cloudflared restart
sleep 3

logread -e cloudflared | tail -n 30 || true
