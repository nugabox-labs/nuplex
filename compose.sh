#!/usr/bin/env bash
# NUPLEX 기동 스크립트. docker compose를 직접 호출하지 않고 항상 이 스크립트를 통해서만 기동한다.
#
# 사용법:
#   ./compose.sh up               운영 모드 기동
#   ./compose.sh --dev up         개발 모드 기동 (핫리로드)
#   ./compose.sh down             중단
#   ./compose.sh restart          재기동 (이미지 재빌드 포함 — 배포 시 새 코드 반영 목적)
#   ./compose.sh migrate          database/*.sql 중 아직 적용 안 된 것만 순서대로 적용
#   ./compose.sh sync [--full]    동기화를 지금 한 번 돌린다 (기본은 증분)
#   ./compose.sh logs [svc] [-f]

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

STATE_FILE=".compose_state"
MODE=""

if [[ "${1:-}" == "--dev" ]]; then
  MODE="dev"
  shift
fi

COMMAND="${1:-}"
shift || true

compose_files() {
  if [[ "$1" == "dev" ]]; then
    echo "-f compose.yml -f compose.dev.yml"
  else
    echo "-f compose.yml"
  fi
}

resolve_mode_from_state() {
  if [[ -z "$MODE" && -f "$STATE_FILE" ]]; then
    MODE="$(cat "$STATE_FILE")"
  fi
  MODE="${MODE:-prod}"
}

case "$COMMAND" in
  up|restart)
    resolve_mode_from_state
    echo "$MODE" > "$STATE_FILE"
    # 이미지 안에서 만들면 root 소유가 되어 sync 워커가 못 쓴다. 먼저 호스트에 만들어 둔다.
    mkdir -p data/media
    # shellcheck disable=SC2046
    # --renew-anon-volumes: compose.dev.yml의 node_modules 익명 볼륨은 이미지가 바뀌어도 재사용된다.
    # 이 플래그 없이는 npm 의존성을 새로 추가해도 컨테이너 안에 반영되지 않는다 — AGENTS.md §4
    docker compose $(compose_files "$MODE") up -d --build --renew-anon-volumes
    ;;
  down)
    resolve_mode_from_state
    # shellcheck disable=SC2046
    docker compose $(compose_files "$MODE") down
    ;;
  migrate)
    # database/*.sql 을 파일명 순으로 보면서 아직 적용되지 않은 것만 트랜잭션으로 적용한다.
    # 적용 이력은 schema_migrations 테이블에 남는다.
    resolve_mode_from_state
    FILES="$(compose_files "$MODE")"

    if [[ ! -f .env ]]; then
      echo "migrate: .env 가 없습니다." >&2
      exit 1
    fi
    PG_USER="$(grep -E '^POSTGRES_USER=' .env | head -1 | cut -d= -f2-)"
    PG_DB="$(grep -E '^POSTGRES_DB=' .env | head -1 | cut -d= -f2-)"
    if [[ -z "$PG_USER" || -z "$PG_DB" ]]; then
      echo "migrate: .env 에서 POSTGRES_USER/POSTGRES_DB 를 읽지 못했습니다." >&2
      exit 1
    fi

    # shellcheck disable=SC2086
    docker compose $FILES up -d db

    echo "migrate: DB 기동 대기..."
    for _ in $(seq 1 60); do
      # shellcheck disable=SC2086
      if docker compose $FILES exec -T db pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1; then
        break
      fi
      sleep 2
    done
    # shellcheck disable=SC2086
    docker compose $FILES exec -T db pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null

    psql_run() {
      # shellcheck disable=SC2086
      docker compose $FILES exec -T db psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 -q "$@"
    }

    psql_run -c "CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );"

    APPLIED_ANY=0
    for sql_file in $(ls database/*.sql 2>/dev/null | sort); do
      migration_id="$(basename "$sql_file" .sql)"
      if [[ -n "$(psql_run -tAc "SELECT 1 FROM schema_migrations WHERE id='$migration_id'")" ]]; then
        echo "migrate: skip  $migration_id"
        continue
      fi
      echo "migrate: apply $migration_id"
      # 실패하면 ON_ERROR_STOP 으로 중단되어 COMMIT 에 닿지 않는다 → 통째로 롤백된다.
      {
        echo "BEGIN;"
        cat "$sql_file"
        echo "INSERT INTO schema_migrations (id) VALUES ('$migration_id');"
        echo "COMMIT;"
      } | psql_run -f -
      APPLIED_ANY=1
    done

    if [[ "$APPLIED_ANY" == "0" ]]; then
      echo "migrate: 적용할 새 마이그레이션 없음"
    else
      echo "migrate: 완료"
    fi
    ;;
  sync)
    # 주기 실행을 기다리지 않고 지금 한 번 돌린다. 워커 컨테이너 안에서 실행된다.
    resolve_mode_from_state
    # shellcheck disable=SC2046
    docker compose $(compose_files "$MODE") exec -T sync npx tsx sync/run.ts "$@"
    ;;
  logs)
    resolve_mode_from_state
    # shellcheck disable=SC2046
    docker compose $(compose_files "$MODE") logs "$@"
    ;;
  *)
    echo "사용법: $0 [--dev] {up|down|restart|migrate|sync [--full]|logs [svc] [-f]}" >&2
    exit 1
    ;;
esac
