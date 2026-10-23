import type { OperationInputSchema, ToolOperationDescriptor } from './contracts.js';
import { TOOL_ENVELOPE_VERSION } from './contracts.js';

type OperationDoc = Pick<ToolOperationDescriptor, 'name' | 'summary' | 'kind' | 'inputSchema'>;

export interface OpenApiInfo {
  readonly title: string;
  readonly version: string;
  readonly description?: string;
}

const envelopeResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Envelope' } } },
});

/**
 * An OpenAPI 3.1 document for the generic dispatch routes: `GET /operations`, `GET /operations/{name}`
 * for help, and one documented `POST /operations/<name>` per operation, whose request body schema is
 * that operation's `inputSchema`. Every response, success or not, is the shared envelope; the HTTP
 * status is derived from its exit code.
 */
export function buildOpenApiDocument(
  operations: readonly OperationDoc[],
  info: OpenApiInfo,
): Record<string, unknown> {
  const sorted = [...operations].sort((a, b) => a.name.localeCompare(b.name));
  const errorStatuses = {
    '400': envelopeResponse('Usage error: unknown or invalid input (exit code 2)'),
    '404': envelopeResponse('Unknown operation, or a source that does not exist (exit code 5)'),
    '409': envelopeResponse(
      'Refused or incomplete: a conflict or a blocked/partial result (exit codes 3 and 4)',
    ),
    '500': envelopeResponse('The operation failed (exit code 1)'),
    '503': envelopeResponse('Infrastructure unavailable (exit code 10)'),
  };

  const paths: Record<string, unknown> = {
    '/operations': {
      get: {
        operationId: 'listOperations',
        summary: 'List the operations',
        responses: { '200': envelopeResponse('Every operation, with its kind and summary') },
      },
    },
    '/operations/{name}': {
      get: {
        operationId: 'describeOperation',
        summary: 'Describe one operation, including its input schema',
        parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': envelopeResponse('The operation'),
          '404': envelopeResponse('Unknown operation'),
        },
      },
    },
  };
  for (const operation of sorted) {
    const schema: OperationInputSchema = operation.inputSchema ?? { type: 'object' };
    paths[`/operations/${operation.name}`] = {
      post: {
        operationId: operation.name,
        summary: operation.summary,
        tags: [operation.kind],
        'x-operation-kind': operation.kind,
        requestBody: {
          required: false,
          content: { 'application/json': { schema } },
        },
        responses: { '200': envelopeResponse('Success'), ...errorStatuses },
      },
    };
  }

  return {
    openapi: '3.1.0',
    info,
    paths,
    components: {
      schemas: {
        Envelope: {
          type: 'object',
          required: ['schemaVersion', 'correlationId', 'operation', 'kind', 'status', 'exitCode'],
          properties: {
            schemaVersion: { type: 'string', const: TOOL_ENVELOPE_VERSION },
            correlationId: { type: 'string' },
            operation: { type: 'string' },
            kind: { type: 'string', enum: ['command', 'query', 'system'] },
            status: { type: 'string', enum: ['success', 'incomplete', 'error'] },
            exitCode: { type: 'integer' },
            data: { description: 'The operation result' },
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                details: {
                  description: 'Structured detail, e.g. the violations behind VALIDATION_FAILED',
                },
              },
            },
          },
        },
      },
    },
  };
}
