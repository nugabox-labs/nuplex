#!/usr/bin/env python3
"""NUPLEX 배포 결과를 Mattermost에 알린다.
.github/workflows/deploy.yml 전용 — 워크플로에 파이썬을 인라인으로 박지 않기 위해 분리했다.
"""

import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))

STATUS_TITLES = {
    "success": ("✅", "성공"),
    "failure": ("❌", "실패"),
    "cancelled": ("⚠️", "취소"),
}


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


def read_file(path: str) -> str:
    if not path or not os.path.isfile(path):
        return ""
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        return f.read().strip()


def main() -> int:
    webhook_url = env("MATTERMOST_WEBHOOK_URL")
    if not webhook_url:
        print("MATTERMOST_WEBHOOK_URL이 없어 알림을 건너뜁니다.")
        return 0

    status = env("DEPLOY_STATUS", "unknown")
    emoji, status_word = STATUS_TITLES.get(status, ("⚠️", status))

    repo = env("REPO")
    repo_short = repo.split("/")[-1] if repo else repo
    branch = env("BRANCH")
    sha = env("COMMIT_SHA")
    short_sha = sha[:12] if sha else ""
    commit_message = env("COMMIT_MESSAGE")
    commit_title = commit_message.splitlines()[0] if commit_message else ""
    author = env("COMMIT_AUTHOR")
    run_url = env("RUN_URL")
    prev_sha = env("PREV_DEPLOY_SHA")
    now_kst = datetime.now(KST).strftime("%Y-%m-%d %H:%M")

    lines = [
        f"#### {emoji} {repo_short} 배포 {status_word}",
        "",
        "| 구분 | 내용 |",
        "|---|---|",
        f"| 저장소 | `{repo}` |",
        f"| 브랜치 | `{branch}` |",
        f"| 커밋 | `{short_sha}` |",
    ]
    if commit_title:
        lines.append(f"| 커밋 제목 | {commit_title} |")
    if author:
        lines.append(f"| 작성자 | {author} |")
    lines.append(f"| 워크플로 | [실행 로그]({run_url}) |")

    info_lines = [
        f"Timestamp (KST): {now_kst}",
        f"Commit: {sha}",
        f"Previous deploy: {prev_sha or '없음'}",
    ]
    compose_ps = read_file(env("COMPOSE_PS_FILE"))
    if compose_ps:
        info_lines += ["", compose_ps]

    lines += ["", "**배포 정보**", "```", *info_lines, "```"]

    # Mattermost 기본 마크다운은 <details>/<summary> 같은 raw HTML을 렌더링하지 않고 그대로
    # 텍스트로 보여준다 — 접이식 대신 그냥 굵은 라벨 + 코드블록으로 표시한다.
    diag = read_file(env("DIAG_FILE")) if status == "failure" else ""
    if diag:
        lines += ["", "**진단 정보**", "```", diag[:3000], "```"]

    payload = json.dumps({"text": "\n".join(lines)}).encode("utf-8")
    request = urllib.request.Request(
        webhook_url, data=payload, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            response.read()
    except Exception as exc:  # 알림 실패가 배포 자체를 실패로 만들면 안 된다
        print(f"Mattermost 알림 전송 실패: {exc}")
        return 0

    return 0


if __name__ == "__main__":
    sys.exit(main())
