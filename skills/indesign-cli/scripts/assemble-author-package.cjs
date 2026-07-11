'use strict';

const path = require('node:path');

try {
  const pluginRoot = path.resolve(process.argv[2]);
  const packagePath = path.resolve(process.argv[3]);
  const { writeAuthorPackageEntry } = require(path.join(pluginRoot, 'src', 'authoring'));
  const result = writeAuthorPackageEntry(packagePath);
  process.stdout.write(JSON.stringify({ ok: true, packagePath, entryPath: result.entryPath }));
} catch (error) {
  process.stderr.write(error && error.stack ? error.stack : String(error));
  process.exit(1);
}
