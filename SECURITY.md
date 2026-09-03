# Security Policy

## Supported versions

Only the latest commit on `main` receives security updates. Older snapshots
are not patched.

## Reporting a vulnerability

**Do not open a public GitHub issue** for security vulnerabilities.

Report privately using one of these channels:

1. **Preferred:** [GitHub Private Vulnerability Reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability) on this repository (Security tab → Report a vulnerability).
2. **Email:** [hi@carbon-copy.org](mailto:hi@carbon-copy.org) with the subject `Murmi security report`.

Please include:

- A description of the issue and its impact
- Steps to reproduce, or a proof of concept if you have one
- Affected version or commit, if known

## Response

- We aim to **acknowledge** reports within **3 business days**.
- We will keep you informed as we triage and fix the issue.
- We follow **coordinated disclosure**. Please give us a reasonable window
  (typically up to 90 days) before public discussion, unless we agree otherwise.

## Scope

**In scope**

- The Murmi web application in this repository (React frontend, FastAPI backend, WebSockets)
- Session handling, vote anonymity, report generation, and deploy scripts in this repository
- Secret handling (environment variables, `.env` usage)

**Out of scope**

- The hosted service at murmi.org (report product/hosting issues to Carbon Copy separately)
- Third-party APIs such as OpenAI
- Denial of service, rate-limit exhaustion, or issues that require already-compromised credentials
- Reports that only affect a self-hosted misconfiguration (for example an exposed `.env` file)
