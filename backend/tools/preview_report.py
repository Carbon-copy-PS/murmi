"""Serve a synthetic local report. No database, API credentials, or publishing calls.

Run from the repository root: python -m backend.tools.preview_report
"""
import argparse
import asyncio
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
from unittest.mock import patch

from backend.app.analysis import AnalysisService
from backend.app.opinion_themes import OpinionThemeService
from backend.app.reporting import build_report_snapshot, build_opinion_landscape, narrative_evidence
from backend.tools.report_fixture import synthetic_session, synthetic_narrative, english_themes


async def build_fixture(language="zh"):
    session = synthetic_session(language)
    report = build_report_snapshot(session, version=1)
    landscape = await build_opinion_landscape(session)

    async def fixed_themes(evidence, language):
        if language == "en":
            return english_themes(evidence)
        return {"groups": [{"groupId": g["groupId"], "title": f"方案回應模式 {g['groupId'] + 1}",
            "description": "此合成群組用於檢查版面；實際投票差異列於下方。",
            "evidenceStatementIds": [s["id"] for s in g["statements"][:2]]}
            for g in evidence["groups"] if len(g["statements"]) >= 2], "shared": None}

    themes = OpinionThemeService(fixed_themes)
    try:
        report["opinionLandscape"] = await themes.enrich(session, landscape, wait=True)
    finally:
        await themes.close()
    with patch.dict(os.environ, {"OPENAI_API_KEY": ""}):
        report["narrative"] = {language: AnalysisService()._normalize_report_narrative(synthetic_narrative(language), narrative_evidence(report))}
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--language', choices=['zh', 'en'], default='zh')
    parser.add_argument('--port', type=int, default=8780)
    parser.add_argument('--write-only', action='store_true', help='Generate the fixture without starting a server')
    parser.add_argument('--output', help='Defaults to a separate preview file for each language')
    args = parser.parse_args()
    report = asyncio.run(build_fixture(args.language))
    default_output = "outputs/local-report-preview-en.json" if args.language == "en" else "outputs/local-report-preview.json"
    dest = Path(args.output or default_output)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    if args.write_only:
        print(f'Wrote synthetic draft: {dest}', flush=True)
        return
    # The local display adapter enables the report view without changing the draft snapshot.
    body = json.dumps({"topic": report['meta']['topic'], "language": args.language, "participantCount": report["meta"]["participantCount"],
        "reportStatus": "published", "report": report}, ensure_ascii=False).encode()
    dist = Path(__file__).resolve().parents[2] / 'frontend' / 'dist'
    if not (dist / 'index.html').exists():
        raise SystemExit('Build the frontend first: scripts/check-reports.sh')

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw): super().__init__(*a, directory=str(dist), **kw)
        def do_GET(self):
            if self.path == '/api/public/results/local-preview':
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if self.path == '/r/local-preview': self.path = '/index.html'
            super().do_GET()

    print(f'Local synthetic preview: http://127.0.0.1:{args.port}/r/local-preview', flush=True)
    ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()


if __name__ == '__main__': main()
