export interface LaunchOptions {
  readonly electronPath: string;
  /** The built app directory (it holds its own `package.json`). */
  readonly appDir: string;
  /** The app's own arguments, such as `--ipc-driver`. */
  readonly args: readonly string[];
  readonly platform: NodeJS.Platform;
  /** `$DISPLAY`, if the machine has one. */
  readonly display: string | undefined;
  /** The user id, where the platform has one. */
  readonly uid: number;
}

export interface LaunchCommand {
  readonly command: string;
  readonly args: string[];
}

/**
 * The command that starts the built app in a machine or container: a Linux box with no display gets
 * a virtual one (`xvfb-run`), and Chromium refuses its sandbox as root, so root gets `--no-sandbox`.
 * Nothing changes on macOS or Windows.
 */
export function launchCommand(options: LaunchOptions): LaunchCommand {
  const linux = options.platform === 'linux';
  const sandbox = linux && options.uid === 0 ? ['--no-sandbox'] : [];
  const electron = [options.electronPath, options.appDir, ...sandbox, ...options.args];
  return linux && !options.display
    ? { command: 'xvfb-run', args: ['-a', ...electron] }
    : { command: electron[0] as string, args: electron.slice(1) };
}
