const fs = require('node:fs');
const path = require('node:path');

const targets = [
  path.join(
    process.cwd(),
    'node_modules',
    '@homebridge',
    'node-pty-prebuilt-multiarch',
    'binding.gyp',
  ),
  path.join(
    process.cwd(),
    'node_modules',
    '@homebridge',
    'node-pty-prebuilt-multiarch',
    'deps',
    'winpty',
    'src',
    'winpty.gyp',
  ),
];

let patchedCount = 0;
for (const targetPath of targets) {
  if (!fs.existsSync(targetPath)) {
    continue;
  }

  const source = fs.readFileSync(targetPath, 'utf8');
  const patched = source.replaceAll(
    "'SpectreMitigation': 'Spectre'",
    "'SpectreMitigation': 'false'",
  );

  if (patched !== source) {
    fs.writeFileSync(targetPath, patched, 'utf8');
    patchedCount += 1;
  }
}

if (patchedCount === 0) {
  console.log('[patch-node-pty-spectre] no patch needed');
  process.exit(0);
}

console.log(`[patch-node-pty-spectre] patched files: ${patchedCount}`);
