/** The GTK text scale used when the environment does not set one. */
export const DEFAULT_GTK_TEXT_SCALE = '1.5';

/**
 * The environment to start Electron with. Some editors' terminals set `ELECTRON_RUN_AS_NODE`, which
 * makes the `electron` binary behave as plain Node (no `electron` module). `NODE_OPTIONS` is dropped
 * too: Electron refuses several flags Node accepts (such as `--use-openssl-ca`) and says so on every
 * start. The GTK menu bar and dialogs are drawn at the desktop's text size, so a scale the user set
 * is kept and otherwise a readable one is used.
 */
export function electronEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const clean = { ...env };
  delete clean['ELECTRON_RUN_AS_NODE'];
  delete clean['NODE_OPTIONS'];
  clean['GDK_DPI_SCALE'] ??= DEFAULT_GTK_TEXT_SCALE;
  return clean;
}
