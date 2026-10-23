import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CONTENT_SECURITY_POLICY, isAllowedNavigation, rendererPreferences } from './security.js';

const here = fileURLToPath(new URL('.', import.meta.url));

describe('the content security policy', () => {
  it('closes scripts and the network, and allows styles inline for the component library', () => {
    const directives = new Map(
      CONTENT_SECURITY_POLICY.split('; ').map((d) => [d.split(' ')[0], d]),
    );
    expect(directives.get('default-src')).toBe("default-src 'none'");
    expect(directives.get('script-src')).toBe("script-src 'self'");
    expect(directives.get('connect-src')).toBe("connect-src 'none'");
    expect(directives.get('form-action')).toBe("form-action 'none'");
    expect(directives.get('style-src')).toContain("'unsafe-inline'");
  });

  it('never allows script evaluation or inline scripts', () => {
    expect(CONTENT_SECURITY_POLICY).not.toContain('unsafe-eval');
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/script-src[^;]*unsafe-inline/);
  });

  it('is the policy the shipped page declares, character for character', () => {
    const page = readFileSync(join(here, 'renderer/index.html'), 'utf8');
    const meta = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(page);
    expect(meta?.[1]).toBe(CONTENT_SECURITY_POLICY);
  });

  it('is declared by a page that loads no remote or inline script', () => {
    const page = readFileSync(join(here, 'renderer/index.html'), 'utf8');
    expect(page).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>[^<]/);
    expect(page).not.toMatch(/https?:\/\//);
  });
});

describe('renderer preferences', () => {
  it('are the locked-down defaults, plus the preload when there is one', () => {
    expect(rendererPreferences('/p/preload.cjs')).toEqual({
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      preload: '/p/preload.cjs',
    });
    expect('preload' in rendererPreferences()).toBe(false);
  });
});

describe('isAllowedNavigation', () => {
  const dir = '/app/renderer';
  it.each([
    ['file:///app/renderer/index.html', true],
    ['file:///app/renderer/assets/a.css', true],
    ['file:///app/renderer/', false],
    ['file:///app/renderer', false],
    ['file:///app/other/index.html', false],
    ['file:///app/renderer-evil/index.html', false],
    ['file:///app/renderer/../secrets.txt', false],
    ['https://example.com/', false],
    ['http://localhost:4200/', false],
    ['data:text/html,hi', false],
    ['app://renderer/index.html', false],
    ['nonsense', false],
    ['file://attacker-host/share/index.html', false],
    ['file:///app/renderer/a%2Fb.html', false],
  ])('%s is %s', (url, allowed) => {
    expect(isAllowedNavigation(url, dir)).toBe(allowed);
  });
});
