# Contributing to Murmi

Thanks for helping improve Murmi. By participating, you agree to follow the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Prerequisites

- Python 3.10 or newer
- Node.js 18 or newer (20 is used in CI)
- An OpenAI API key is optional; mock mode works without one

## Getting the source

```bash
git clone <this-repository-url>
cd murmi
cp .env.example .env
# Optionally add OPENAI_API_KEY to .env
./start.sh
```

`./start.sh` creates the backend virtualenv, installs frontend dependencies,
and starts the API on port 8000 and the Vite dev server on port 5173.

Do not commit `.env`, session exports, or generated reports. Those paths are
gitignored on purpose.

## Tests

From the repository root:

```bash
python3 -m pip install -r backend/requirements.txt
python3 -m unittest discover -s backend/tests -t .

node --test backend/app/report-opinion-analysis.test.mjs
node --test data-analysis/polis-inspired-analysis.test.mjs
```

Frontend production build (also run in CI):

```bash
cd frontend
npm ci
npm run build
```

Add or update tests when you change claim extraction, reporting, or opinion
analysis. There is no coverage gate yet.

## Development workflow

1. Open an issue for non-trivial changes, or reference an existing one.
2. Create a branch from `main`: `feat/short-description` or `fix/short-description`.
3. Keep commits focused. Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`) are appreciated but not required.
4. Open a pull request and fill in the template.
5. Make sure CI is green. Maintainers squash-merge when the change is ready.

## Documentation

Update [README.md](README.md) when you change setup, configuration, or
user-facing behavior. Update [CHANGELOG.md](CHANGELOG.md) under **Unreleased**
for notable changes.

## Security

Do not report vulnerabilities in public issues. See [SECURITY.md](SECURITY.md).
