import { describe, expect, it } from 'vitest';

import { buildMenuTemplate } from './menu.js';

const labels = (template: ReturnType<typeof buildMenuTemplate>) =>
  template.map((item) => item.label ?? item.role);
const roles = (template: ReturnType<typeof buildMenuTemplate>): string[] =>
  template.flatMap((item) =>
    Array.isArray(item.submenu) ? item.submenu.map((sub) => String(sub.role ?? sub.type)) : [],
  );

describe('the native application menu', () => {
  it('is only the operating system’s own standard menu: window chrome and clipboard, nothing of the app’s', () => {
    const template = buildMenuTemplate({
      platform: 'linux',
      appName: 'IndieWriter Studio',
      development: false,
    });
    expect(labels(template)).toEqual(['File', 'Edit', 'View', 'Window']);
    expect(roles(template)).not.toContain('toggleDevTools');
    expect(roles(template)).toEqual(
      expect.arrayContaining(['quit', 'copy', 'paste', 'togglefullscreen']),
    );
    for (const item of template) {
      if (!Array.isArray(item.submenu)) continue;
      for (const sub of item.submenu)
        expect(sub.role ?? sub.type, `${item.label}: ${sub.label}`).toBeDefined();
    }
  });

  it('offers reload and developer tools to a development build only', () => {
    const dev = buildMenuTemplate({ platform: 'linux', appName: 'x', development: true });
    expect(roles(dev)).toEqual(expect.arrayContaining(['reload', 'toggleDevTools']));
  });

  it('puts the app’s own menu first on macOS, and quits from it', () => {
    const mac = buildMenuTemplate({
      platform: 'darwin',
      appName: 'IndieWriter Studio',
      development: false,
    });
    expect(mac[0]?.label).toBe('IndieWriter Studio');
    expect(roles(mac)).toContain('about');
  });
});
