#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DUCKDNS_TOKEN:-}" ]]; then
  echo "DUCKDNS_TOKEN is required."
  echo "Usage: DUCKDNS_TOKEN=your_token DOMAIN=boj-mock-test.duckdns.org SUBDOMAIN=boj-mock-test bash deploy/full-setup.sh"
  exit 1
fi

DOMAIN="${DOMAIN:-boj-mock-test.duckdns.org}"
SUBDOMAIN="${SUBDOMAIN:-boj-mock-test}"

echo "== BOJ Mock Test: Full Setup =="
echo "Domain: ${DOMAIN}"
echo "Subdomain: ${SUBDOMAIN}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bash "${SCRIPT_DIR}/oracle-setup.sh"

DUCKDNS_TOKEN="${DUCKDNS_TOKEN}" DOMAIN="${DOMAIN}" SUBDOMAIN="${SUBDOMAIN}" bash "${SCRIPT_DIR}/duckdns-setup.sh"

echo "All done."
