# Release

1. Release the server first. Update `server.json` to its release tag and SHA-256 of `release.json`.
2. Bump the extension version, run `npm ci`, `npm run fetch:server`, `npm run verify`, `npm run test:editor` and `npm run test:restart`.
3. Tag `v<extension-version>`. GitHub Actions tests Windows and Linux, packages both VSIX files and publishes a GitHub prerelease with checksums. Manual workflow runs also produce downloadable build artifacts without publishing.

Keep the publisher/name stable. No Marketplace credentials or publication are required. Before a release, review staged files, dependency notices and packaged binaries for private data. Only synthetic source belongs in either repository.
