## Development

Use pnpm from the repository root and keep `pnpm-lock.yaml` as the only
JavaScript package-manager lockfile. See [README.md](README.md) for setup.

## Validation

After code changes, run `pnpm typecheck` and `pnpm lint:fix`, then the checks
for the affected stack:


## Coding conventions

- Keep client code, backend code and shared contracts in their respective
  packages. Update shared types and OpenAPI when HTTP behavior changes.
- Prefer the existing shadcn/ui (BaseUI) components and theme tokens. Keep
  custom styling minimal, with generously sized controls; reserve `text-xs`
  for genuinely compact elements such as tag pills.

Keep active work directly under `docs/`, completed records in named subfolders.