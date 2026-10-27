# Security

## Reporting a vulnerability

Use the repository's **Security → Report a vulnerability** flow if private vulnerability reporting is enabled. If it is unavailable, open a minimal issue asking for a private contact without disclosing the vulnerability, credentials or an exploit.

Include the affected revision, the relevant endpoint or source path, a minimal reproduction using test accounts, and the expected impact. Do not test against live users or move funds without authorization.

## Deployment boundaries

- Keep `.env` files, RPC/provider credentials, administrative tokens and signing keys outside Git.
- The optional studio key signs platform operations. Creators sign their own transactions in their wallets.
- Review changes to transaction construction, signer requirements, decoded review, CSRF/session checks and platform automation before deployment.
- Use disposable test databases and local validators for destructive testing.

This publication is a source release, not a claim that the application has undergone an independent security audit.
