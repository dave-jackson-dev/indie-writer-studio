import { request } from 'node:http';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createComponents } from '../components.js';
import { startHttpServer, type RunningServer } from './serve.js';

let server: RunningServer;
beforeAll(async () => {
  server = await startHttpServer({
    port: 0,
    corsOrigins: ['https://reader.example'],
    components: createComponents({}),
  });
});
afterAll(() => server.close());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const body = async (response: Response): Promise<any> => response.json();

describe('HTTP transport', () => {
  it('binds to loopback and reports its URL', () => {
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  it('answers GET /health with the success envelope', async () => {
    const response = await fetch(`${server.url}/health`);
    expect(response.status).toBe(200);
    expect(await body(response)).toMatchObject({
      operation: 'system.health',
      status: 'success',
      data: { status: 'ok', service: 'indie-writer' },
    });
  });

  it('dispatches an operation by name', async () => {
    const response = await fetch(`${server.url}/operations/system.health`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(200);
    expect((await body(response)).data.status).toBe('ok');
  });

  it('answers an unknown operation with 404 and the envelope', async () => {
    const response = await fetch(`${server.url}/operations/nope.nothing`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(404);
    expect(await body(response)).toMatchObject({
      status: 'error',
      error: { code: 'UNKNOWN_OPERATION' },
    });
  });

  it('answers an unknown route with the envelope too', async () => {
    const response = await fetch(`${server.url}/nowhere`);
    expect(response.status).toBe(404);
    expect(await body(response)).toMatchObject({
      status: 'error',
      error: { code: 'NOT_FOUND' },
    });
  });

  it('serves the operation list and an OpenAPI document that names system.health', async () => {
    expect(await (await fetch(`${server.url}/operations`)).text()).toContain('system.health');
    const doc = await body(await fetch(`${server.url}/openapi.json`));
    expect(JSON.stringify(doc)).toContain('system.health');
  });

  it('allows a configured CORS origin and refuses an unknown one', async () => {
    const allowed = await fetch(`${server.url}/health`, {
      headers: { origin: 'https://reader.example' },
    });
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://reader.example');
    const refused = await fetch(`${server.url}/health`, {
      headers: { origin: 'https://evil.example' },
    });
    expect(refused.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('refuses a request from a disallowed origin before it runs, whatever the method', async () => {
    for (const method of ['GET', 'POST'] as const) {
      const response = await fetch(`${server.url}/operations/system.health`, {
        method,
        headers: { origin: 'https://evil.example', 'content-type': 'text/plain' },
        body: method === 'POST' ? '{}' : undefined,
      });
      expect(response.status).toBe(403);
      expect(await body(response)).toMatchObject({ error: { code: 'FORBIDDEN_ORIGIN' } });
    }
  });

  it('refuses a non-loopback Host header while bound to loopback (DNS rebinding)', async () => {
    const { port } = new URL(server.url);
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(
        { host: '127.0.0.1', port, path: '/health', headers: { host: 'rebound.example' } },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on('error', reject);
      req.end();
    });
    expect(status).toBe(403);
  });
});
