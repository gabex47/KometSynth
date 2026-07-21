# Changelog

All notable changes are documented here. This project follows semantic versioning once release tags are introduced.

## Unreleased

### Added

- Invite-only, email-free account registration with expiring, revocable, usage-limited codes.
- Editable account profiles and persistent dark, light, or system theme preference.
- Self-service PIN rotation and per-device session inspection and revocation.
- Administrator invitation management, account search and metrics, forced logout, lifecycle controls, and guarded deletion.
- Database-backed account profiles, invitations, session controls, audit events, constraints, RLS, ACLs, and supporting indexes.
- Automated source-secret, duplicate-file, and migration security guardrails.
- Security policy and contributor documentation.

### Changed

- Reworked login and registration UX for clearer validation, responsive layout, and accessible feedback.
- Expanded administrative workflows while retaining owner-only escalation and last-owner protection.
- Added security checks to the standard verification pipeline.

### Security

- Invitation codes are returned once and persisted only as SHA-256 hashes.
- Account creation and invitation consumption are atomic and concurrency-safe.
- New tables remain inaccessible to browser roles and all lifecycle RPCs are service-role only.
- Sensitive account changes revoke sessions and write append-only audit entries.
