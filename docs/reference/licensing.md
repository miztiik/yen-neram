# Licensing

**Last Updated**: 2026-06-29

Yen-Neram has no repository-level `LICENSE` file. The codebase is all-rights-reserved by default.

## Code Package Contract

- Root and workspace `package.json` files use `"license": "UNLICENSED"`.
- Without an SPDX-recognized repository license, nobody is granted permission to copy, modify, redistribute, or build on the code without explicit permission from the author.
- Re-licensing later means adding a repository `LICENSE` file and updating package metadata in the same change.

## Asset Manifests

Theme manifests keep per-asset license metadata. Those licenses describe asset provenance and reuse boundaries independently of the surrounding codebase.

Do not remove per-asset license fields just because the codebase is unlicensed; they are useful receipts for every in-bundle theme.

## See also

- [../../README.md](../../README.md) - public project entry point.
- [../concepts/theme-system.md](../concepts/theme-system.md) - theme manifest contract.
- [../../apps/frontend/public/assets/themes/README.md](../../apps/frontend/public/assets/themes/README.md) - theme asset operator guide.
