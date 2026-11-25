#!/usr/bin/env bash
# Smoke-tests the running app (expects `npm run dev` already up on :3000,
# DATABASE_URL pointing at a real Postgres, and the seed data loaded via
# `node_modules/.bin/tsx scripts/seed-demo-data.ts`).
set -uo pipefail
cd "$(dirname "$0")/.."

BASE="http://localhost:3000"
PASS=0
FAIL=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  PASS  $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

echo "== Disputes API =="
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/disputes")
check "GET /api/disputes" 200 "$code"

DISPUTE_ID=$(PGPASSWORD=dispute_shield psql -h localhost -U dispute_shield -d dispute_shield -t \
  -c "SELECT id FROM \"Dispute\" WHERE \"stripeDisputeId\"='dp_demo_fraud_002';" | tr -d '[:space:]')
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/disputes/$DISPUTE_ID")
check "GET /api/disputes/:id (known id)" 200 "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/disputes/does-not-exist")
check "GET /api/disputes/:id (unknown id) -> 404" 404 "$code"

echo "== Access events API =="
APIKEY=$(PGPASSWORD=dispute_shield psql -h localhost -U dispute_shield -d dispute_shield -t \
  -c "SELECT \"apiKey\" FROM \"Merchant\" LIMIT 1;" | tr -d '[:space:]')

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/access-events" \
  -H "Authorization: Bearer $APIKEY" -H "Content-Type: application/json" \
  -d '{"customerEmail":"smoketest@example.com","eventType":"login"}')
check "POST /api/access-events (valid)" 201 "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/access-events" \
  -H "Content-Type: application/json" \
  -d '{"customerEmail":"x@example.com","eventType":"login"}')
check "POST /api/access-events (no key) -> 401" 401 "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/access-events" \
  -H "Authorization: Bearer wrong" -H "Content-Type: application/json" \
  -d '{"customerEmail":"x@example.com","eventType":"login"}')
check "POST /api/access-events (bad key) -> 401" 401 "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/access-events" \
  -H "Authorization: Bearer $APIKEY" -H "Content-Type: application/json" \
  -d '{"customerEmail":"not-an-email","eventType":"login"}')
check "POST /api/access-events (bad payload) -> 400" 400 "$code"

echo "== Review/approve flow =="
code=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE/api/disputes/$DISPUTE_ID" \
  -H "Content-Type: application/json" \
  -d '{"narrative":"Smoke-test narrative.","narrativeApproved":true,"status":"READY_TO_SUBMIT"}')
check "PATCH /api/disputes/:id (approve)" 200 "$code"

status=$(curl -s "$BASE/api/disputes/$DISPUTE_ID" | python3 -c "import json,sys;print(json.load(sys.stdin)['status'])")
check "status persisted as READY_TO_SUBMIT" "READY_TO_SUBMIT" "$status"

echo "== Webhook signature verification =="
node scripts/test-webhook.mjs
webhook_exit=$?

echo
echo "---"
echo "$PASS passed, $FAIL failed (curl checks); webhook script exit=$webhook_exit"
[ "$FAIL" -eq 0 ] && [ "$webhook_exit" -eq 0 ]
