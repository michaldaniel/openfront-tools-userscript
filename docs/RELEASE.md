# Release Process

The README is user-facing. Keep release chores here so the public landing page stays focused on installing and using the script.

1. Update `@version` in `openfront-tools.user.js`.
2. Update the version badge and changelog in `README.md` and `CHANGELOG.md`.
3. Run:

```sh
node --check openfront-tools.user.js
```

4. Commit the release:

```sh
git add openfront-tools.user.js README.md CHANGELOG.md docs/RELEASE.md
git commit -m "Release vX.Y.Z"
```

5. Tag the release:

```sh
git tag vX.Y.Z
git push origin main --tags
```

6. Create a GitHub release and attach `openfront-tools.user.js`.

Recommended release title:

```text
OpenFront Tools vX.Y.Z
```

Recommended release notes:

```text
See CHANGELOG.md for details.
```
