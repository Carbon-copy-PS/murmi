#!/usr/bin/env bash
# Local-only validation. Does not push, publish, connect to production, or restart services.
set -euo pipefail
cd "$(dirname "$0")/.."
REPORT_PYTHON="${REPORT_PYTHON:-.venv/bin/python}"
# Prevent app imports from loading service credentials from an ancestor .env.
export OPENAI_API_KEY='' POSTGRES_HOST='' POSTGRES_PASSWORD='' GOOGLE_APPLICATION_CREDENTIALS=''
"$REPORT_PYTHON" -m unittest discover -s backend/tests -t .
node --test backend/app/report-opinion-analysis.test.mjs
node --test data-analysis/polis-inspired-analysis.test.mjs
node --test frontend/src/utils/transcript-text.test.mjs frontend/src/components/opinion-groups/group-differences.test.mjs frontend/src/components/final-report/statement-patterns.test.mjs
"$REPORT_PYTHON" -m backend.tools.preview_report --write-only
node scripts/check-report-render.mjs
"$REPORT_PYTHON" -m backend.tools.preview_report --language en --write-only
node scripts/check-report-render.mjs outputs/local-report-preview-en.json
node frontend/node_modules/vite/bin/vite.js build frontend
git diff --check
