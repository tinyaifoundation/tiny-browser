# Security policy

Tiny Browser executes untrusted public pages inside a sandboxed iframe and fetches their assets through a local gateway. The gateway is intended for **single-user localhost development only**. It is not an authenticated public proxy or a safe place to handle sensitive browsing sessions.

The gateway blocks private, loopback, link-local, and reserved network addresses; validates redirects; caps response size; and uses a validated DNS address for each connection. A security report should include the target URL, expected behavior, actual behavior, and a minimal reproduction. Please avoid including real credentials or private data.

For a suspected vulnerability, use GitHub's private vulnerability reporting for this repository after publication. Do not open a public issue containing exploit details. For ordinary bugs or site compatibility problems, open a regular issue.
