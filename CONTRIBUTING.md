# Contributing to Tiny Browser

Thanks for helping make an agent browser that is easy to run and inspect.

1. Open an issue for substantial behavior or API changes so the approach can be discussed.
2. Fork the repository, make a focused branch, and keep changes small enough to review.
3. Run `pnpm install`, `pnpm typecheck`, and `pnpm test`.
4. Describe the behavior you changed, how you checked it, and any compatibility limits in your pull request.

The built-in demo at `https://demo.tinybrowser/` is a deterministic place to check snapshots and actions. Use public test sites for gateway checks; the gateway intentionally blocks private network targets. Add tests for changes to URL parsing, network validation, or content rewriting.

Keep the host API, page runtime, and gateway responsibilities separate. Avoid adding a large browser dependency or remote execution requirement to the default path. Generated shadcn/ui components live in `apps/playground/src/components/ui` and can be edited like regular source files.

By contributing, you agree that your contributions are licensed under the repository's MIT license.
