const fs = require('node:fs/promises');
const path = require('node:path');
const pngToIco = require('png-to-ico').default;

async function main() {
  const source = path.join(process.cwd(), 'public', 'app-icon.png');
  const target = path.join(process.cwd(), 'public', 'app-icon.ico');
  const ico = await pngToIco(source);

  await fs.writeFile(target, ico);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
