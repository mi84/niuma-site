#!/bin/sh
set -eu

SITE_SRC="${1:-/www/niuma-site-temp}"
CONF_SRC="${2:-/root/niuma-domain/niuma-openwrt-http.conf}"
SITE_DST="/srv/www/niuma.ru/current"

opkg update
opkg install nginx-ssl

mkdir -p /srv/www/niuma.ru "$SITE_DST" /etc/nginx/conf.d
rm -rf "$SITE_DST"/*
cp -a "$SITE_SRC"/. "$SITE_DST"/
cp "$CONF_SRC" /etc/nginx/conf.d/niuma.ru.conf

uci -q delete uhttpd.niuma_temp
uci -q delete uhttpd.main.listen_http
uci add_list uhttpd.main.listen_http='0.0.0.0:8081'
uci add_list uhttpd.main.listen_http='[::]:8081'
uci -q delete uhttpd.main.listen_https
uci add_list uhttpd.main.listen_https='0.0.0.0:8443'
uci add_list uhttpd.main.listen_https='[::]:8443'
uci commit uhttpd

/etc/init.d/uhttpd restart
/etc/init.d/nginx enable
/etc/init.d/nginx restart
