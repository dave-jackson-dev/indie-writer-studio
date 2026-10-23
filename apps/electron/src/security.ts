import { isAbsolute, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The renderer's content security policy (ADR-004 D4). Nothing is loaded from the network, no script
 * is inline or evaluated, and the page cannot be framed or post a form. Styles may be inline,
 * because the component library creates style elements at run time. The shipped page's `<meta>` tag
 * must carry exactly this text; a spec compares them so the two cannot drift.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

export interface RendererPreferences {
  contextIsolation: true;
  nodeIntegration: false;
  nodeIntegrationInWorker: false;
  nodeIntegrationInSubFrames: false;
  sandbox: true;
  webSecurity: true;
  allowRunningInsecureContent: false;
  experimentalFeatures: false;
  preload?: string;
}

/** Every renderer window gets these and nothing looser (ADR-004 D4). */
export function rendererPreferences(preload?: string): RendererPreferences {
  return {
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
    ...(preload === undefined ? {} : { preload }),
  };
}

/**
 * A page may navigate only to a file inside the renderer directory the app shipped. Anything else
 * (another file, http, a custom scheme) is denied; new windows are always denied.
 */
export function isAllowedNavigation(url: string, rendererDir: string): boolean {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return false;
  }
  if (target.protocol !== 'file:') return false;
  // `relative` rather than a string prefix: it is right for Windows paths and for a sibling that shares the prefix.
  let path: string;
  try {
    path = fileURLToPath(target);
  } catch {
    return false; // a host component or an encoded separator: not a path inside the renderer
  }
  const inside = relative(rendererDir, path);
  return inside !== '' && !inside.startsWith('..') && !isAbsolute(inside);
}
