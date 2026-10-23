import { resolve } from 'node:path';

import { bundleFromSibling, vendorDirectory, verifyVendored } from './lib/vendor.js';

/**
 *   tsx tools/typedblite-vendor/src/cli.ts bundle [--sibling <dir>]   rebuild vendor/typedblite from lean-agile-os
 *   tsx tools/typedblite-vendor/src/cli.ts verify                     fail if the bundle differs from its provenance
 */
const [command, ...rest] = process.argv.slice(2);

if (command === 'verify') {
  const result = verifyVendored();
  if (!result.ok) {
    console.error(`vendor/typedblite is not as recorded: ${result.problem}`);
    process.exit(1);
  }
  console.log('vendor/typedblite matches its provenance.');
} else if (command === 'bundle') {
  const at = rest.indexOf('--sibling');
  const sibling = resolve(at >= 0 && rest[at + 1] ? (rest[at + 1] as string) : '../lean-agile-os');
  const provenance = await bundleFromSibling(sibling);
  console.log(
    `Bundled ${provenance.package}@${provenance.packageVersion} (${provenance.bytes} bytes, ` +
      `sibling ${provenance.siblingCommit.slice(0, 12)}) into ${vendorDirectory}.`,
  );
} else {
  console.error('Usage: cli.ts bundle [--sibling <dir>] | verify');
  process.exit(2);
}
