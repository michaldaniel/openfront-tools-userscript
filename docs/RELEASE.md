# Release Process

Use this checklist when publishing a new version.

1. Update version references:
   - `@version` and `VERSION` in `openfront-tools.user.js`
   - version badge in `README.md`
   - top entry in `CHANGELOG.md`
2. Check the script:
```sh
node --check openfront-tools.user.js
```

3. Commit and tag:
```sh
git add openfront-tools.user.js README.md CHANGELOG.md docs/RELEASE.md
git commit -m "Release vX.Y.Z"
git tag vX.Y.Z
git push origin main --tags
```

4. Create a GitHub release:
   - title: `OpenFront Tools vX.Y.Z`
   - notes: copy the matching `CHANGELOG.md` section
   - asset: attach `openfront-tools.user.js`

## Install URL

```txt
https://raw.githubusercontent.com/michaldaniel/openfront-tools-userscript/main/openfront-tools.user.js
```
