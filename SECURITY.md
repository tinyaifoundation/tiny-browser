# Security policy

Tiny Browser fetches untrusted public pages through a developer-hosted relay and renders them in a sandboxed iframe in the visitor's browser. The hosted relay requires a server-held proxy secret and a trusted user ID on browsing and runtime routes. It must sit behind an authenticated same-origin application proxy. The local demo mode binds to `127.0.0.1` and remains single-user only.

The relay blocks private and reserved addresses, validates redirects, pins the validated DNS address, caps responses, times out upstream requests, and applies process-local quotas. These controls do not replace application authentication, network isolation, shared rate limiting across replicas, HTTPS, or careful handling of untrusted target-page content. See the [deployment security checklist](docs/deployment.md#security-checklist).

Please use GitHub private vulnerability reporting for suspected security issues. Include a minimal reproduction and avoid real credentials or private data. Use a regular issue for ordinary bugs and site compatibility reports.
