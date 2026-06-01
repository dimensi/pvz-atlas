Review and harden the app for privacy, secrets, and production MVP usage.

Use AGENTS.md and pvz-test-review.

Check and fix:
- No secrets committed.
- `.env.example` is complete.
- Browser bundle does not include Google service account credentials.
- Owner/contact fields are not logged.
- API validates all input.
- Error messages do not leak secrets or private data.
- Public pages do not expose owner/contact data unintentionally.
- Sync conflicts are visible, not silently ignored.
- Manual sheet malformed rows are reported safely.
- Build/typecheck/lint pass.

Deliver a concise hardening report with remaining risks.
