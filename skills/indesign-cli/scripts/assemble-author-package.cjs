'use strict';

const path = require('node:path');

try {
  const pluginRoot = path.resolve(process.argv[2]);
  const packagePath = path.resolve(process.argv[3]);
  const { writeAuthorPackageEntry } = require(path.join(pluginRoot, 'src', 'authoring'));
  const result = writeAuthorPackageEntry(packagePath);
  // presentation：预览文件被重写 / 删除 / 不存在；旧版插件不返回这个字段。
  process.stdout.write(JSON.stringify({
    ok: true,
    packagePath,
    entryPath: result.entryPath,
    ...(result.presentation ? { presentation: result.presentation } : {}),
  }));
} catch (error) {
  process.stderr.write(error && error.stack ? error.stack : String(error));
  if (error && error.code) process.stderr.write(`\ncode: ${error.code}`);
  if (error && error.hint) process.stderr.write(`\nhint: ${error.hint}`);
  process.exit(1);
}
