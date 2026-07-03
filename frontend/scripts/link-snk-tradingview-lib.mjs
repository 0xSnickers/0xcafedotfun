import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDir, '..');
const defaultLibRoot = '/Users/chuizi/josen/codex-coding/snk-tradingview-lib';
const libRoot = resolve(process.env.SNK_TRADINGVIEW_LIB_DIR || defaultLibRoot);

const packages = ['core', 'datafeed', 'overlays', 'react'];
const scopeDir = join(frontendRoot, 'node_modules', '@snk-tradingview-lib');
const publicAssetsDir = join(frontendRoot, 'public', 'tradingview');
const sourceAssetsDir = join(libRoot, 'vendor', 'tradingview', 'v28.3');

function assertExists(path, label) {
  if (!existsSync(path)) {
    throw new Error(`${label} not found: ${path}`);
  }
}

assertExists(libRoot, 'snk-tradingview-lib root');
assertExists(sourceAssetsDir, 'TradingView assets');

mkdirSync(scopeDir, { recursive: true });

for (const packageName of packages) {
  const source = join(libRoot, 'packages', packageName);
  const target = join(scopeDir, packageName);
  const sourceDist = join(source, 'dist');
  const sourcePackageJson = join(source, 'package.json');
  assertExists(source, `Package ${packageName}`);
  assertExists(sourceDist, `Package ${packageName} dist`);
  assertExists(sourcePackageJson, `Package ${packageName} package.json`);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  cpSync(sourcePackageJson, join(target, 'package.json'), { force: true });
  cpSync(sourceDist, join(target, 'dist'), { recursive: true, force: true });
  console.log(`Copied @snk-tradingview-lib/${packageName} from ${source}`);
}

rmSync(publicAssetsDir, { recursive: true, force: true });
mkdirSync(publicAssetsDir, { recursive: true });

for (const entry of readdirSync(sourceAssetsDir)) {
  cpSync(join(sourceAssetsDir, entry), join(publicAssetsDir, entry), {
    recursive: true,
    force: true,
  });
}

console.log(`Synced TradingView assets -> ${publicAssetsDir}`);
