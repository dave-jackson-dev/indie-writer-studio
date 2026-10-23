import { describe, expect, it } from 'vitest';

import { buildOpenApiDocument } from './openapi.js';

const doc = buildOpenApiDocument(
  [
    {
      name: 'b.run',
      summary: 'Run',
      kind: 'command',
      inputSchema: { type: 'object', properties: { x: { type: 'string' } } },
    },
    { name: 'a.read', summary: 'Read', kind: 'query' },
  ],
  { title: 'T', version: '1' },
) as {
  openapi: string;
  info: unknown;
  paths: Record<
    string,
    Record<
      string,
      {
        operationId: string;
        tags?: string[];
        requestBody?: { content: Record<string, { schema: unknown }> };
        responses: Record<string, unknown>;
      }
    >
  >;
  components: { schemas: { Envelope: { required: string[] } } };
};

describe('buildOpenApiDocument', () => {
  it('is OpenAPI 3.1 with the given info', () => {
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info).toEqual({ title: 'T', version: '1' });
  });

  it('has the generic routes and one POST path per operation, sorted', () => {
    expect(Object.keys(doc.paths)).toEqual([
      '/operations',
      '/operations/{name}',
      '/operations/a.read',
      '/operations/b.run',
    ]);
  });

  it("uses each operation's input schema as the request body, defaulting to a bare object", () => {
    expect(
      doc.paths['/operations/b.run']?.['post']?.requestBody?.content['application/json']?.schema,
    ).toEqual({
      type: 'object',
      properties: { x: { type: 'string' } },
    });
    expect(
      doc.paths['/operations/a.read']?.['post']?.requestBody?.content['application/json']?.schema,
    ).toEqual({ type: 'object' });
  });

  it('tags by kind and documents every error status with the envelope', () => {
    const post = doc.paths['/operations/b.run']?.['post'];
    expect(post?.tags).toEqual(['command']);
    expect(Object.keys(post?.responses ?? {})).toEqual(['200', '400', '404', '409', '500', '503']);
  });

  it('describes the envelope', () => {
    expect(doc.components.schemas.Envelope.required).toContain('schemaVersion');
  });
});
