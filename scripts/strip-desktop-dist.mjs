// The desktop app bundles dist/. Website-only files don't belong in it: the
// Mac download itself (public/downloads) and local test media (public/__dev__).
import { rmSync } from 'node:fs'

for (const dir of ['dist/downloads', 'dist/__dev__']) rmSync(dir, { recursive: true, force: true })
