#!/bin/sh
# The image is one artifact for two instances. SAM_AUTH picks the sign-in mode and is
# written into config.json, which the SPA reads at boot:
#
#   password  private instance: Stremio e-mail and password (the default, LAN only)
#   link      public instance: device-link code confirmed on stremio.com, no password
#             field is rendered at all
#
# Nothing else differs between the two, so the same build serves both.
set -eu

mode="${SAM_AUTH:-password}"
case "$mode" in
  link|password) ;;
  *)
    echo "SAM_AUTH must be 'link' or 'password', got '$mode'" >&2
    exit 1
    ;;
esac

printf '{"auth":"%s"}\n' "$mode" > /usr/share/nginx/html/config.json
echo "SAM: sign-in mode '$mode'"

exec "$@"
