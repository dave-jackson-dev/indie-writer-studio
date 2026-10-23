import 'reflect-metadata';

import {
  CqrsToolRuntime,
  formatOperationsHelp,
  runInteractiveRepl,
  runJsonLinesDriver,
  runOneShot,
  type ToolIo,
} from '@indie-writer-studio/cqrs-tool-runtime';
import { NestFactory } from '@nestjs/core';
import { CommandBus, QueryBus } from '@nestjs/cqrs';

import { AppModule } from './app.module.js';
import { COMPONENTS } from './components.js';
import { startHttpServer } from './http/serve.js';
import { operationsFor } from './operations.js';

export const EXECUTABLE = 'indie-writer';

export interface Tool {
  runtime: CqrsToolRuntime;
  close: () => Promise<void>;
}

/** Boots the Nest context and builds the runtime over its buses. */
export async function createTool(): Promise<Tool> {
  const context = await NestFactory.createApplicationContext(AppModule.forComponents(COMPONENTS), {
    logger: false,
  });
  const runtime = new CqrsToolRuntime({
    commandBus: context.get(CommandBus),
    queryBus: context.get(QueryBus),
    operations: operationsFor(COMPONENTS),
  });
  return { runtime, close: () => context.close() };
}

const defaultIo: ToolIo = {
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
};

/**
 * Entry point shared by the binary and the tests. `--help` and an empty command line answer
 * without starting Nest; `--repl` opens the prompt (`--json` for one compact envelope per line);
 * `--sidecar` speaks newline-delimited JSON on stdin and stdout;
 * anything else is one operation, as on the CLI.
 */
export async function run(argv: readonly string[], io: ToolIo = defaultIo): Promise<number> {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    io.stdout(formatOperationsHelp(operationsFor(COMPONENTS), EXECUTABLE));
    return 0;
  }
  if (argv[0] === '--http') return serveHttp(argv.slice(1), io);
  const tool = await createTool();
  try {
    if (argv[0] === '--repl') {
      await runInteractiveRepl(tool.runtime, {
        json: argv.includes('--json'),
        prompt: `${EXECUTABLE}> `,
      });
      return 0;
    }
    if (argv[0] === '--sidecar') {
      await runJsonLinesDriver(tool.runtime);
      return 0;
    }
    return await runOneShot(tool.runtime, argv, io, EXECUTABLE);
  } finally {
    await tool.close();
  }
}

const flag = (args: readonly string[], name: string): string[] =>
  args.flatMap((arg, index) =>
    arg === name && args[index + 1] !== undefined ? [args[index + 1] as string] : [],
  );

/**
 * `--http [--host H] [--port N] [--cors-origin O]...`: serves until interrupted. Prints one line,
 * `{"event":"listening","url":"..."}`, once ready, so a parent process can find a port-0 server.
 */
async function serveHttp(args: readonly string[], io: ToolIo): Promise<number> {
  const port = flag(args, '--port')[0];
  const server = await startHttpServer({
    host: flag(args, '--host')[0],
    port: port === undefined ? undefined : Number(port),
    corsOrigins: flag(args, '--cors-origin'),
  });
  io.stdout(JSON.stringify({ event: 'listening', url: server.url }));
  await new Promise<void>((resolve) => {
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => resolve());
  });
  await server.close();
  return 0;
}
