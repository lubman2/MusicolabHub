#!/usr/bin/env bash
# Repeatable RBAC integration check (issue #159, derived from PR #158's
# verified one-off run). Spins an ephemeral Postgres + dev server, seeds
# owner/viewer/admin/stranger + one project, asserts the five headline
# RBAC behaviors, and tears everything down. Requires: Docker running,
# Node >= 22 in PATH, ports 5433 and 3100 free.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env.local ]; then
  echo "ABORT: .env.local exists — move it aside first (this script writes and deletes its own)." >&2
  exit 2
fi

FAILED=0
cleanup() {
  pkill -f "next dev -p 3100" 2>/dev/null || true
  docker rm -f mcb-rbac-pg >/dev/null 2>&1 || true
  rm -f .env.local
}
trap cleanup EXIT

echo "== starting ephemeral postgres =="
docker rm -f mcb-rbac-pg >/dev/null 2>&1 || true
docker run -d --name mcb-rbac-pg -e POSTGRES_PASSWORD=pg -e POSTGRES_USER=pg -e POSTGRES_DB=mcb -p 5433:5432 postgres:16 >/dev/null
for i in $(seq 1 30); do
  docker exec mcb-rbac-pg pg_isready -U pg -d mcb >/dev/null 2>&1 && break
  sleep 1
done

cat > .env.local <<'ENV'
DATABASE_URL="postgresql://pg:pg@localhost:5433/mcb"
NEXTAUTH_SECRET="rbac-e2e-secret-0000000000000000000000"
APP_URL="http://127.0.0.1:3100"
NEXT_PUBLIC_APP_URL="http://127.0.0.1:3100"
AWS_ACCESS_KEY_ID="dummy"
AWS_SECRET_ACCESS_KEY="dummy"
AWS_S3_BUCKET="dummy-bucket"
AWS_REGION="eu-central-1"
ENV

echo "== migrate deploy =="
# prisma.config.ts loads .env only (not .env.local) — pass the URL explicitly.
DATABASE_URL="postgresql://pg:pg@localhost:5433/mcb" npx prisma migrate deploy 2>&1 | tail -3

echo "== boot dev server =="
(E2E_TEST_MODE=1 npx next dev -p 3100 >/tmp/rbac-check-dev.log 2>&1 &)
for i in $(seq 1 30); do
  curl -sf -o /dev/null http://127.0.0.1:3100/api/test/users -X POST -H 'content-type: application/json' -d '{"email":"warmup@test.dev","password":"testpass123"}' && break
  sleep 2
done

mkuser() {
  curl -s -X POST http://127.0.0.1:3100/api/test/users -H 'content-type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"testpass123\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])"
}
login_cookie() {
  curl -s -i -X POST http://127.0.0.1:3100/api/auth/login -H 'content-type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"testpass123\"}" | grep -i '^set-cookie' | sed 's/.*session=\([^;]*\).*/session=\1/'
}

echo "== seed =="
OWNER_ID=$(mkuser owner@test.dev)
VIEWER_ID=$(mkuser viewer@test.dev)
ADMIN_ID=$(mkuser admin@test.dev)
STRANGER_ID=$(mkuser stranger@test.dev)
# /api/test/users cannot set role — promote admin via SQL.
docker exec mcb-rbac-pg psql -U pg -d mcb -q -c "UPDATE \"User\" SET role='admin' WHERE id='$ADMIN_ID';"
PROJECT_ID=$(docker exec mcb-rbac-pg psql -U pg -d mcb -qtc "INSERT INTO \"Project\" (id, \"ownerId\", title, status, \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), '$OWNER_ID', 'RBAC check project', 'active', now(), now()) RETURNING id;" | tr -d ' ')
docker exec mcb-rbac-pg psql -U pg -d mcb -q -c "INSERT INTO \"ProjectMember\" (id, \"projectId\", \"userId\", role, \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), '$PROJECT_ID', '$VIEWER_ID', 'viewer', now(), now());"

VIEWER_COOKIE=$(login_cookie viewer@test.dev)
ADMIN_COOKIE=$(login_cookie admin@test.dev)
STRANGER_COOKIE=$(login_cookie stranger@test.dev)

check() { # desc expected actual
  if [ "$2" = "$3" ]; then echo "PASS: $1 ($3)"; else echo "FAIL: $1 (expected $2, got $3)"; FAILED=1; fi
}

echo "== assertions =="
check "viewer GET /files (#141)" 200 "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/api/projects/$PROJECT_ID/files -H "cookie: $VIEWER_COOKIE")"
check "viewer POST /files/upload-url (negative control)" 403 "$(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:3100/api/projects/$PROJECT_ID/files/upload-url -H "cookie: $VIEWER_COOKIE" -H 'content-type: application/json' -d '{"filename":"t.mp3","mimeType":"audio/mpeg","fileSize":1000}')"
check "admin PUT /projects/:id on foreign project (#142)" 200 "$(curl -s -o /dev/null -w '%{http_code}' -X PUT http://127.0.0.1:3100/api/projects/$PROJECT_ID -H "cookie: $ADMIN_COOKIE" -H 'content-type: application/json' -d '{"title":"Renamed by admin"}')"
check "non-member GET /versions (membership gate)" 403 "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/api/projects/$PROJECT_ID/versions -H "cookie: $STRANGER_COOKIE")"
check "member-viewer GET /splits (RBAC-12)" 403 "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/api/projects/$PROJECT_ID/splits -H "cookie: $VIEWER_COOKIE")"

if [ "$FAILED" -ne 0 ]; then echo "RESULT: FAIL"; exit 1; fi
echo "RESULT: all 5 assertions passed"
