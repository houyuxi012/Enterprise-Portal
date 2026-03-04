#!/bin/sh
set -eu

WATCH_FILES="${PLATFORM_RELOAD_WATCH_FILES:-/etc/nginx/conf.d/platform_server_name.conf /etc/nginx/certs/hyx_ngep.cer /etc/nginx/certs/hyx_ngep.key}"
WATCH_INTERVAL_SECONDS="${PLATFORM_RELOAD_WATCH_INTERVAL_SECONDS:-2}"

calc_signature() {
  signature=""
  for file in $WATCH_FILES; do
    if [ -f "$file" ]; then
      hash="$(md5sum "$file" | awk '{print $1}')"
      signature="${signature}|${file}:${hash}"
    else
      signature="${signature}|${file}:missing"
    fi
  done
  printf "%s" "$signature"
}

watch_and_reload() {
  previous="$(calc_signature)"
  while true; do
    sleep "$WATCH_INTERVAL_SECONDS"
    current="$(calc_signature)"
    if [ "$current" != "$previous" ]; then
      previous="$current"
      if nginx -t >/tmp/nginx-watch-test.log 2>&1; then
        if nginx -s reload >/tmp/nginx-watch-reload.log 2>&1; then
          echo "[platform-watch] nginx reloaded after platform file change"
        else
          echo "[platform-watch] reload command failed"
          cat /tmp/nginx-watch-reload.log || true
        fi
      else
        echo "[platform-watch] nginx -t failed, skip reload"
        cat /tmp/nginx-watch-test.log || true
      fi
    fi
  done
}

watch_and_reload &

exec nginx -g "daemon off;"
