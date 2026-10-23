/**
 * Writes Syncfusion's light and dark themes without their one network reference.
 *
 * Each theme's `base/base.css` begins with an `@import` of Roboto from Google Fonts. The desktop app loads nothing from the
 * network (ADR-004 D4), so the policy blocks it and the console fills with errors. This copies each theme's own
 * import list, replacing `base/base.css` with a copy that lacks that first line. Output is generated, not committed.
 *
 * The light theme (`@syncfusion/ej2-material-theme`) is bundled into the window's stylesheet. The dark theme
 * (`@syncfusion/ej2-material-dark-theme`, pinned to the same version) cannot be nested under a selector, so it is a stylesheet
 * of its own that a `<link>` switches on and off by the colour scheme (see `theme-init.js` in the shared library).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const out = join(root, 'apps/writer/src/generated');

function write(packageName: string, entry: string, baseName: string, themeName: string): void {
  const styles = join(root, 'node_modules/@syncfusion', packageName, 'styles');
  const base = readFileSync(join(styles, 'base/base.css'), 'utf8');
  const network = /^@import url\(["']https?:[^)]*\);?\s*$/m;
  if (!network.test(base.split('\n', 3).join('\n'))) {
    throw new Error(
      `${packageName}: base/base.css no longer starts with the font import; check the theme before relying on this script.`,
    );
  }

  const imports = readFileSync(join(styles, entry), 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('@import'))
    .map((line) =>
      line.replace(/^@import\s+["']([^"']+)["'];?$/, (_m, path: string) =>
        path === 'base/base.css'
          ? `@import './${baseName}';`
          : `@import '@syncfusion/${packageName}/styles/${path}';`,
      ),
    );
  if (imports.some((line) => /https?:/.test(line) || !line.startsWith('@import'))) {
    throw new Error(`${packageName}: the theme has an import this script does not understand.`);
  }

  writeFileSync(join(out, baseName), base.replace(network, ''));
  writeFileSync(join(out, themeName), `${imports.join('\n')}\n`);
  console.log(`Wrote ${imports.length} imports of ${packageName} to ${join(out, themeName)}`);
}

mkdirSync(out, { recursive: true });
write('ej2-material-theme', 'material.css', 'syncfusion-base.css', 'syncfusion-theme.css');
write(
  'ej2-material-dark-theme',
  'material-dark.css',
  'syncfusion-dark-base.css',
  'syncfusion-dark-theme.css',
);
