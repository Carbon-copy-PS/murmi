## Summary

What does this change do, and why?

## Test plan

- [ ] `python3 -m unittest discover -s backend/tests -t .`
- [ ] `node --test backend/app/report-opinion-analysis.test.mjs`
- [ ] `node --test data-analysis/polis-inspired-analysis.test.mjs`
- [ ] Frontend still builds (`cd frontend && npm run build`) if UI changed
- [ ] Manual check of the affected flow (create session / vote / report) if user-facing

## Checklist

- [ ] I did not commit `.env`, secrets, session exports, or generated reports
- [ ] Docs / CHANGELOG updated when the change is user-visible
