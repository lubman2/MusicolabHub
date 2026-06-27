#!/usr/bin/env python3
from __future__ import annotations

import argparse
import html
import json
from collections import Counter, defaultdict
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


REPO_ROOT = Path(__file__).resolve().parents[2]
ISSUES_PATH = REPO_ROOT / ".beads" / "issues.jsonl"

STATE_ORDER = ["in_progress", "blocked", "open", "closed", "deferred"]
STATE_LABELS = {
    "open": "Open",
    "in_progress": "In Progress",
    "blocked": "Blocked",
    "closed": "Closed",
    "deferred": "Deferred",
}
STATE_TONES = {
    "open": "amber",
    "in_progress": "cyan",
    "blocked": "rose",
    "closed": "mint",
    "deferred": "slate",
}
PRIORITY_LABELS = {
    0: "P0",
    1: "P1",
    2: "P2",
    3: "P3",
    4: "P4",
}


@dataclass
class IssueView:
    raw: dict[str, Any]
    code: str | None
    epic_code: str | None
    derived_state: str
    bucket: str
    unresolved_dependencies: int
    dependency_ids: list[str]
    dependent_count: int


def normalize_priority(value: Any) -> int:
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.upper().startswith("P") and value[1:].isdigit():
        return int(value[1:])
    return 4


def extract_code(title: str) -> str | None:
    if title.startswith("EPIC-"):
        return title.split(":", 1)[0].strip()
    prefix = title.split(":", 1)[0].strip()
    if len(prefix) == 5 and prefix[:2].isdigit() and prefix[2] == "-" and prefix[3:].isdigit():
        return prefix
    return None


def extract_epic_code(title: str) -> str | None:
    code = extract_code(title)
    if not code:
        return None
    if code.startswith("EPIC-"):
        return code
    return f"EPIC-{code[:2]}"


def infer_bucket(issue: dict[str, Any], epic_title: str | None) -> str:
    title = issue["title"]
    epic_hint = epic_title or title
    if "Stream 2" in epic_hint or "Stream 2" in title:
        return "Stream 2"
    code = extract_epic_code(title)
    if code == "EPIC-09":
        return "Ops"
    if code == "EPIC-00":
        return "Tooling"
    if code and code.startswith("EPIC-"):
        return "MVP Core"
    if title.startswith("09-"):
        return "Ops"
    if title.startswith("00-"):
        return "Tooling"
    if title.startswith(("10-", "11-", "12-")):
        return "Stream 2"
    if title[:2].isdigit():
        return "MVP Core"
    return "Unmapped"


def load_issues() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not ISSUES_PATH.exists():
        return rows
    for line in ISSUES_PATH.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        rows.append(json.loads(line))
    return rows


def derive_state(issue: dict[str, Any], status_by_id: dict[str, str]) -> tuple[str, int]:
    status = issue.get("status", "open")
    if status in {"closed", "deferred", "in_progress"}:
        return status, 0

    unresolved = 0
    for dep in issue.get("dependencies", []):
        dep_id = dep.get("depends_on_id")
        if not dep_id:
            continue
        if status_by_id.get(dep_id) != "closed":
            unresolved += 1

    if unresolved:
        return "blocked", unresolved
    return status, 0


def build_view_model() -> dict[str, Any]:
    issues = load_issues()
    status_by_id = {issue["id"]: issue.get("status", "open") for issue in issues}
    epics_by_code = {
        extract_code(issue["title"]): issue
        for issue in issues
        if issue["title"].startswith("EPIC-")
    }

    issue_views: list[IssueView] = []
    bucket_counts: Counter[str] = Counter()
    state_counts: Counter[str] = Counter()
    board_columns: dict[str, list[IssueView]] = defaultdict(list)

    for issue in issues:
        title = issue["title"]
        epic_code = extract_epic_code(title)
        epic_issue = epics_by_code.get(epic_code) if epic_code else None
        epic_title = epic_issue["title"] if epic_issue else None
        derived_state, unresolved_dependencies = derive_state(issue, status_by_id)
        issue_view = IssueView(
            raw=issue,
            code=extract_code(title),
            epic_code=epic_code,
            derived_state=derived_state,
            bucket=infer_bucket(issue, epic_title),
            unresolved_dependencies=unresolved_dependencies,
            dependency_ids=[dep.get("depends_on_id", "") for dep in issue.get("dependencies", []) if dep.get("depends_on_id")],
            dependent_count=issue.get("dependent_count", 0),
        )
        issue_views.append(issue_view)
        bucket_counts[issue_view.bucket] += 1
        state_counts[derived_state] += 1
        board_columns[derived_state].append(issue_view)

    for state in STATE_ORDER:
        board_columns[state].sort(
            key=lambda view: (
                normalize_priority(view.raw.get("priority")),
                view.bucket,
                view.raw["title"].lower(),
            )
        )

    epic_views = []
    for code, epic in sorted(epics_by_code.items()):
        epic_tasks = [view for view in issue_views if view.epic_code == code and view.raw["id"] != epic["id"]]
        if epic_tasks:
            done = sum(1 for view in epic_tasks if view.raw.get("status") == "closed")
            active = sum(1 for view in epic_tasks if view.derived_state in {"open", "in_progress", "blocked"})
        else:
            done = 0
            active = 0
        total = len(epic_tasks)
        epic_bucket = infer_bucket(epic, epic["title"])
        epic_views.append(
            {
                "id": epic["id"],
                "title": epic["title"],
                "bucket": epic_bucket,
                "priority": PRIORITY_LABELS.get(normalize_priority(epic.get("priority")), "P4"),
                "task_total": total,
                "task_done": done,
                "task_active": active,
                "progress": 0 if total == 0 else round(done / total * 100),
                "state": derive_state(epic, status_by_id)[0],
                "dependent_count": epic.get("dependent_count", 0),
            }
        )

    epic_views.sort(key=lambda epic: (epic["bucket"], epic["title"]))

    return {
        "repo_root": str(REPO_ROOT),
        "issues_path": str(ISSUES_PATH),
        "issue_total": len(issue_views),
        "state_counts": {state: state_counts.get(state, 0) for state in STATE_ORDER},
        "bucket_counts": dict(bucket_counts),
        "board_columns": {state: board_columns.get(state, []) for state in STATE_ORDER},
        "epics": epic_views,
        "last_updated": max((issue.get("updated_at", "") for issue in issues), default=""),
    }


def badge(label: str, tone: str) -> str:
    return f'<span class="badge badge-{tone}">{html.escape(label)}</span>'


def render_issue_card(view: IssueView) -> str:
    issue = view.raw
    priority = PRIORITY_LABELS.get(normalize_priority(issue.get("priority")), "P4")
    status_badge = badge(STATE_LABELS[view.derived_state], STATE_TONES[view.derived_state])
    type_badge = badge(issue.get("issue_type", "task"), "slate")
    bucket_badge = badge(view.bucket, "violet" if view.bucket == "Stream 2" else "cyan" if view.bucket == "MVP Core" else "amber" if view.bucket == "Ops" else "mint")
    meta = []
    if view.epic_code:
        meta.append(f'<span>{html.escape(view.epic_code)}</span>')
    meta.append(f"<span>{html.escape(priority)}</span>")
    if view.unresolved_dependencies:
        meta.append(f"<span>{view.unresolved_dependencies} unresolved deps</span>")
    elif view.dependency_ids:
        meta.append(f"<span>{len(view.dependency_ids)} deps</span>")
    if view.dependent_count:
        meta.append(f"<span>{view.dependent_count} dependents</span>")

    return f"""
    <article class="card">
      <div class="card-top">
        <div class="card-id">{html.escape(issue["id"])}</div>
        <div class="card-badges">{status_badge}{type_badge}</div>
      </div>
      <h3>{html.escape(issue["title"])}</h3>
      <p>{html.escape(issue.get("description", ""))}</p>
      <div class="card-meta">{''.join(f'<span>{item}</span>' for item in meta)}</div>
      <div class="card-footer">{bucket_badge}</div>
    </article>
    """


def render_html(model: dict[str, Any]) -> str:
    summary_cards = []
    for state in STATE_ORDER:
        summary_cards.append(
            f"""
            <section class="summary-card tone-{STATE_TONES[state]}">
              <div class="summary-label">{STATE_LABELS[state]}</div>
              <div class="summary-value">{model['state_counts'][state]}</div>
            </section>
            """
        )

    bucket_cards = []
    for bucket in ["MVP Core", "Ops", "Stream 2", "Tooling", "Unmapped"]:
        if bucket not in model["bucket_counts"]:
            continue
        bucket_cards.append(
            f"""
            <section class="scope-card">
              <div class="scope-title">{html.escape(bucket)}</div>
              <div class="scope-value">{model['bucket_counts'][bucket]}</div>
            </section>
            """
        )

    epic_rows = []
    for epic in model["epics"]:
        epic_rows.append(
            f"""
            <article class="epic-row">
              <div class="epic-row-top">
                <div>
                  <div class="epic-title">{html.escape(epic['title'])}</div>
                  <div class="epic-meta">{html.escape(epic['bucket'])} · {html.escape(epic['priority'])} · {STATE_LABELS[epic['state']]}</div>
                </div>
                <div class="epic-metric">{epic['task_done']}/{epic['task_total']}</div>
              </div>
              <div class="progress-track">
                <div class="progress-fill" style="width: {epic['progress']}%"></div>
              </div>
            </article>
            """
        )

    columns = []
    for state in STATE_ORDER:
        cards = "".join(render_issue_card(view) for view in model["board_columns"][state])
        columns.append(
            f"""
            <section class="column">
              <div class="column-head">
                <h2>{STATE_LABELS[state]}</h2>
                <span>{model['state_counts'][state]}</span>
              </div>
              <div class="column-body">{cards or '<div class="empty">No issues in this state.</div>'}</div>
            </section>
            """
        )

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MusicolabHub Beads Dashboard</title>
  <style>
    :root {{
      --bg: #08111e;
      --bg-alt: #0f1a2b;
      --panel: rgba(10, 19, 34, 0.86);
      --panel-strong: rgba(13, 24, 42, 0.96);
      --line: rgba(167, 190, 218, 0.15);
      --text: #edf4ff;
      --muted: #8ea7c8;
      --cyan: #4cc9f0;
      --amber: #f4a63a;
      --rose: #ff6b8a;
      --mint: #59d7a7;
      --violet: #7c8cff;
      --slate: #8f9ab1;
      --shadow: 0 20px 50px rgba(0, 0, 0, 0.28);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: "Avenir Next", "Segoe UI", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(76, 201, 240, 0.14), transparent 26%),
        radial-gradient(circle at top right, rgba(255, 107, 138, 0.12), transparent 24%),
        linear-gradient(180deg, #09111d, #060c15 58%, #07101d);
      min-height: 100vh;
    }}
    .shell {{
      width: min(1440px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 28px 0 40px;
    }}
    .hero {{
      display: grid;
      grid-template-columns: 1.4fr .8fr;
      gap: 18px;
      margin-bottom: 18px;
    }}
    .hero-card, .panel {{
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 24px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(12px);
    }}
    .hero-card {{
      padding: 24px;
      position: relative;
      overflow: hidden;
    }}
    .hero-card::after {{
      content: "";
      position: absolute;
      inset: auto -8% -45% auto;
      width: 240px;
      height: 240px;
      background: radial-gradient(circle, rgba(124, 140, 255, 0.22), transparent 65%);
      pointer-events: none;
    }}
    .eyebrow {{
      color: var(--cyan);
      text-transform: uppercase;
      letter-spacing: 0.12em;
      font-size: 12px;
      margin-bottom: 12px;
    }}
    h1 {{
      margin: 0 0 10px;
      font-size: clamp(30px, 4vw, 54px);
      line-height: 0.95;
      letter-spacing: -0.04em;
    }}
    .hero-copy {{
      max-width: 52ch;
      color: var(--muted);
      line-height: 1.55;
      margin: 0 0 18px;
    }}
    .hero-meta {{
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }}
    .pill {{
      padding: 8px 12px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.03);
      color: var(--muted);
      font-size: 13px;
    }}
    .summary-grid, .scope-grid {{
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }}
    .summary-card, .scope-card {{
      padding: 18px;
      border-radius: 20px;
      background: var(--panel-strong);
      border: 1px solid var(--line);
    }}
    .summary-label, .scope-title {{
      color: var(--muted);
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }}
    .summary-value, .scope-value {{
      margin-top: 6px;
      font-size: 34px;
      font-weight: 700;
      letter-spacing: -0.04em;
    }}
    .tone-cyan .summary-value {{ color: var(--cyan); }}
    .tone-amber .summary-value {{ color: var(--amber); }}
    .tone-rose .summary-value {{ color: var(--rose); }}
    .tone-mint .summary-value {{ color: var(--mint); }}
    .tone-slate .summary-value {{ color: var(--slate); }}
    .layout {{
      display: grid;
      grid-template-columns: 380px 1fr;
      gap: 18px;
      align-items: start;
    }}
    .layout > * {{
      min-width: 0;
    }}
    .panel {{
      padding: 18px;
      min-width: 0;
      overflow: hidden;
    }}
    .panel h2 {{
      margin: 0 0 12px;
      font-size: 15px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--muted);
    }}
    .epic-list {{
      display: grid;
      gap: 12px;
      max-height: calc(100vh - 300px);
      overflow: auto;
      padding-right: 4px;
    }}
    .epic-row {{
      padding: 14px;
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--line);
    }}
    .epic-row-top {{
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 10px;
    }}
    .epic-title {{
      font-weight: 700;
      line-height: 1.3;
      margin-bottom: 4px;
    }}
    .epic-meta {{
      color: var(--muted);
      font-size: 13px;
    }}
    .epic-metric {{
      color: var(--cyan);
      font-weight: 700;
      white-space: nowrap;
    }}
    .progress-track {{
      height: 10px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.07);
      overflow: hidden;
    }}
    .progress-fill {{
      height: 100%;
      background: linear-gradient(90deg, var(--cyan), var(--mint));
      border-radius: inherit;
    }}
    .board {{
      display: grid;
      grid-template-columns: repeat(5, minmax(250px, 1fr));
      gap: 14px;
      overflow: auto;
      padding-bottom: 4px;
      min-width: 0;
      align-items: start;
    }}
    .column {{
      min-width: 250px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--line);
      border-radius: 22px;
      padding: 14px;
      overflow: hidden;
    }}
    .column-head {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      gap: 10px;
      min-width: 0;
    }}
    .column-head h2 {{
      margin: 0;
      font-size: 15px;
      letter-spacing: -0.02em;
      color: var(--text);
      text-transform: none;
      min-width: 0;
    }}
    .column-head span {{
      color: var(--muted);
      font-size: 13px;
      flex: 0 0 auto;
    }}
    .column-body {{
      display: grid;
      gap: 12px;
      min-width: 0;
    }}
    .card {{
      padding: 14px;
      border-radius: 18px;
      background: var(--panel-strong);
      border: 1px solid var(--line);
      min-width: 0;
      overflow: hidden;
    }}
    .card-top {{
      display: flex;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 10px;
      min-width: 0;
      align-items: start;
    }}
    .card-id {{
      color: var(--muted);
      font-size: 12px;
      letter-spacing: 0.04em;
      min-width: 0;
      overflow-wrap: anywhere;
    }}
    .card-badges, .card-footer {{
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      min-width: 0;
    }}
    .card-badges {{
      justify-content: flex-end;
      flex: 0 1 auto;
    }}
    .card h3 {{
      margin: 0 0 8px;
      font-size: 16px;
      line-height: 1.28;
      overflow-wrap: anywhere;
    }}
    .card p {{
      margin: 0 0 12px;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.45;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 5;
      overflow: hidden;
      overflow-wrap: anywhere;
    }}
    .card-meta {{
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 12px;
      min-width: 0;
      overflow-wrap: anywhere;
    }}
    .badge {{
      display: inline-flex;
      align-items: center;
      padding: 5px 10px;
      border-radius: 999px;
      border: 1px solid currentColor;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      line-height: 1;
    }}
    .badge-cyan {{ color: var(--cyan); }}
    .badge-amber {{ color: var(--amber); }}
    .badge-rose {{ color: var(--rose); }}
    .badge-mint {{ color: var(--mint); }}
    .badge-violet {{ color: var(--violet); }}
    .badge-slate {{ color: var(--slate); }}
    .empty {{
      padding: 18px;
      border-radius: 16px;
      border: 1px dashed var(--line);
      color: var(--muted);
      text-align: center;
      font-size: 14px;
    }}
    @media (max-width: 1180px) {{
      .hero, .layout {{
        grid-template-columns: 1fr;
      }}
      .epic-list {{
        max-height: none;
      }}
    }}
    @media (max-width: 760px) {{
      .shell {{
        width: min(100vw - 20px, 100%);
        padding-top: 20px;
      }}
      .summary-grid, .scope-grid {{
        grid-template-columns: 1fr 1fr;
      }}
    }}
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <article class="hero-card">
        <div class="eyebrow">Beads Visual State</div>
        <h1>MusicolabHub Workboard</h1>
        <p class="hero-copy">
          Read-only dashboard over <code>.beads/issues.jsonl</code>. The board stays outside the application
          source tree and keeps beads as the only source of truth for delivery tracking.
        </p>
        <div class="hero-meta">
          <span class="pill">{html.escape(model['repo_root'])}</span>
          <span class="pill">{model['issue_total']} issues</span>
          <span class="pill">Updated {html.escape(model['last_updated'] or 'n/a')}</span>
        </div>
      </article>
      <div>
        <section class="summary-grid">
          {''.join(summary_cards)}
        </section>
        <section class="scope-grid" style="margin-top: 12px;">
          {''.join(bucket_cards)}
        </section>
      </div>
    </section>

    <section class="layout">
      <aside class="panel">
        <h2>Epic Progress</h2>
        <div class="epic-list">
          {''.join(epic_rows)}
        </div>
      </aside>

      <section class="panel">
        <h2>Kanban</h2>
        <div class="board">
          {''.join(columns)}
        </div>
      </section>
    </section>
  </main>
</body>
</html>
"""


class DashboardHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path not in {"/", "/index.html"}:
            self.send_error(404, "Not found")
            return

        model = build_view_model()
        body = render_html(model).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: Any) -> None:
        return


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve a local dashboard for beads issues.")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind. Default: 127.0.0.1")
    parser.add_argument("--port", type=int, default=8765, help="Port to bind. Default: 8765")
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), DashboardHandler)
    print(f"Beads dashboard running at http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
