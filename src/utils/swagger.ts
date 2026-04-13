import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import type { Application } from 'express';
import { logger } from './logger';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Document Intelligence API',
      version: '1.0.0',
      description: `
# Document Intelligence API

A powerful API service for processing documents with OCR and AI analysis.

## Features
- **Document Upload**: Upload PDF, DOCX, images, and text files
- **OCR Processing**: Extract text from scanned documents and images
- **AI Analysis**: Entity extraction, summarization, classification
- **Search**: Full-text search across processed documents
- **Webhooks**: Real-time notifications for processing events
- **Multi-tenancy**: Support for multiple organizations/users

## Authentication
The API supports two authentication methods:
1. **API Keys**: Simple token-based authentication for server-to-server communication
2. **JWT Tokens**: For user sessions and mobile applications

## Rate Limiting
Tier-based rate limits:
- **Free**: 100 requests/day
- **Basic**: 10,000 requests/day
- **Pro**: 100,000 requests/day
- **Enterprise**: Custom limits

## Getting Started
1. Get an API key or create an account
2. Upload documents using the \`/documents\` endpoint
3. Monitor processing status using the \`/documents/{id}\` endpoint
4. Retrieve processed results when status is \`completed\`

## Support
For support, contact: support@document-intelligence.com
      `,
      contact: {
        name: 'API Support',
        email: 'support@document-intelligence.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000/api/v1',
        description: 'Development server',
      },
      {
        url: 'https://api.document-intelligence.com/v1',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for authentication',
        },
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token for authentication',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  example: 'validation_error',
                },
                message: {
                  type: 'string',
                  example: 'Invalid request parameters',
                },
                details: {
                  type: 'object',
                  example: {
                    field: 'file',
                    issue: 'File exceeds maximum size of 100MB',
                  },
                },
                request_id: {
                  type: 'string',
                  example: 'req_789',
                },
                timestamp: {
                  type: 'string',
                  format: 'date-time',
                  example: '2026-04-13T15:45:30Z',
                },
              },
            },
          },
        },
        DocumentUploadRequest: {
          type: 'object',
          properties: {
            metadata: {
              type: 'object',
              properties: {
                title: {
                  type: 'string',
                  example: 'Quarterly Report Q1 2026',
                },
                description: {
                  type: 'string',
                  example: 'Financial report for Q1 2026',
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  example: ['financial', 'quarterly', 'report'],
                },
                language: {
                  type: 'string',
                  example: 'en',
                },
                document_type: {
                  type: 'string',
                  example: 'report',
                },
                custom_fields: {
                  type: 'object',
                  additionalProperties: true,
                },
              },
            },
            callback_url: {
              type: 'string',
              format: 'url',
              example: 'https://webhook.example.com/document-processed',
            },
            processing_options: {
              type: 'object',
              properties: {
                ocr_engine: {
                  type: 'string',
                  enum: ['tesseract', 'pdfjs', 'auto'],
                  default: 'auto',
                },
                language_hint: {
                  type: 'string',
                  example: 'eng',
                },
                extract_tables: {
                  type: 'boolean',
                  default: false,
                },
                extract_images: {
                  type: 'boolean',
                  default: false,
                },
                ai_models: {
                  type: 'array',
                  items: { type: 'string' },
                  example: ['entity_extraction', 'summarization'],
                },
              },
            },
          },
        },
        DocumentResponse: {
          type: 'object',
          properties: {
            document_id: {
              type: 'string',
              example: 'doc_1234567890abcdef',
            },
            status: {
              type: 'string',
              enum: ['queued', 'processing', 'completed', 'failed'],
              example: 'queued',
            },
            progress: {
              type: 'integer',
              minimum: 0,
              maximum: 100,
              example: 0,
            },
            result: {
              type: 'object',
              properties: {
                extracted_text: {
                  type: 'string',
                  example: 'Full extracted text content...',
                },
                entities: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      type: {
                        type: 'string',
                        enum: ['PERSON', 'ORGANIZATION', 'DATE', 'MONEY', 'LOCATION'],
                      },
                      value: { type: 'string' },
                      confidence: { type: 'number', minimum: 0, maximum: 1 },
                      start_offset: { type: 'integer' },
                      end_offset: { type: 'integer' },
                    },
                  },
                },
                summary: {
                  type: 'string',
                  example: 'Document summary...',
                },
                metadata: {
                  type: 'object',
                  additionalProperties: true,
                },
                processing_time_ms: {
                  type: 'integer',
                  example: 2450,
                },
              },
            },
            error_message: {
              type: 'string',
              nullable: true,
              example: null,
            },
            created_at: {
              type: 'string',
              format: 'date-time',
            },
            completed_at: {
              type: 'string',
              format: 'date-time',
              nullable: true,
            },
          },
        },
        SearchResponse: {
          type: 'object',
          properties: {
            results: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/DocumentResponse',
              },
            },
            total: {
              type: 'integer',
              example: 245,
            },
            page: {
              type: 'integer',
              example: 1,
            },
            size: {
              type: 'integer',
              example: 20,
            },
            took_ms: {
              type: 'integer',
              example: 45,
            },
          },
        },
        AuthTokenResponse: {
          type: 'object',
          properties: {
            access_token: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
            refresh_token: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
            token_type: {
              type: 'string',
              example: 'bearer',
            },
            expires_in: {
              type: 'integer',
              example: 3600,
            },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                role: { type: 'string' },
              },
            },
          },
        },
      },
    },
    security: [
      {
        ApiKeyAuth: [],
      },
      {
        BearerAuth: [],
      },
    ],
    tags: [
      {
        name: 'Authentication',
        description: 'Authentication and token management',
      },
      {
        name: 'Documents',
        description: 'Document upload, management, and processing',
      },
      {
        name: 'Search',
        description: 'Search across processed documents',
      },
      {
        name: 'Admin',
        description: 'Administrative endpoints (requires admin role)',
      },
    ],
    paths: {
      '/auth/token': {
        post: {
          tags: ['Authentication'],
          summary: 'Get authentication token',
          description: 'Get access token using API key or email/password',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    grant_type: {
                      type: 'string',
                      enum: ['api_key', 'password'],
                      default: 'api_key',
                    },
                    api_key: {
                      type: 'string',
                      description: 'Required for api_key grant type',
                    },
                    email: {
                      type: 'string',
                      format: 'email',
                      description: 'Required for password grant type',
                    },
                    password: {
                      type: 'string',
                      description: 'Required for password grant type',
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Authentication successful',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/AuthTokenResponse',
                  },
                },
              },
            },
            401: {
              description: 'Authentication failed',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error',
                  },
                },
              },
            },
          },
        },
      },
      '/auth/refresh': {
        post: {
          tags: ['Authentication'],
          summary: 'Refresh authentication token',
          description: 'Get new access token using refresh token',
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['refresh_token'],
                  properties: {
                    refresh_token: {
                      type: 'string',
                      example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Token refreshed successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      access_token: {
                        type: 'string',
                        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                      },
                      refresh_token: {
                        type: 'string',
                        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                      },
                      token_type: {
                        type: 'string',
                        example: 'bearer',
                      },
                      expires_in: {
                        type: 'integer',
                        example: 3600,
                      },
                    },
                  },
                },
              },
            },
            401: {
              description: 'Invalid refresh token',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error',
                  },
                },
              },
            },
          },
        },
      },
      '/auth/register': {
        post: {
          tags: ['Authentication'],
          summary: 'Register new user',
          description: 'Register a new user account (for demonstration purposes)',
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email: {
                      type: 'string',
                      format: 'email',
                      example: 'user@example.com',
                    },
                    password: {
                      type: 'string',
                      minLength: 8,
                      example: 'password123',
                    },
                    name: {
                      type: 'string',
                      example: 'John Doe',
                    },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: 'User registered successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      user: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          email: { type: 'string' },
                          role: { type: 'string' },
                          created_at: { type: 'string', format: 'date-time' },
                        },
                      },
                      access_token: {
                        type: 'string',
                        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                      },
                      token_type: {
                        type: 'string',
                        example: 'bearer',
                      },
                      expires_in: {
                        type: 'integer',
                        example: 3600,
                      },
                      api_key: {
                        type: 'string',
                        description: 'API key (only shown once)',
                      },
                      message: {
                        type: 'string',
                        example: 'API key will only be shown once. Save it securely.',
                      },
                    },
                  },
                },
              },
            },
            400: {
              description: 'Validation error or user already exists',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error',
                  },
                },
              },
            },
          },
        },
      },
      '/auth/api-keys': {
        post: {
          tags: ['Authentication'],
          summary: 'Create API key',
          description: 'Create a new API key for the authenticated user',
          security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: {
                      type: 'string',
                      minLength: 1,
                      maxLength: 100,
                      example: 'Production API Key',
                    },
                    scopes: {
                      type: 'array',
                      items: { type: 'string' },
                      example: ['documents:read', 'documents:write'],
                    },
                    expires_in_days: {
                      type: 'integer',
                      minimum: 1,
                      maximum: 365,
                      example: 90,
                    },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: 'API key created successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      api_key: {
                        type: 'string',
                        description: 'API key (only shown once)',
                      },
                      name: {
                        type: 'string',
                      },
                      prefix: {
                        type: 'string',
                      },
                      scopes: {
                        type: 'array',
                        items: { type: 'string' },
                      },
                      expires_at: {
                        type: 'string',
                        format: 'date-time',
                        nullable: true,
                      },
                      created_at: {
                        type: 'string',
                        format: 'date-time',
                      },
                      message: {
                        type: 'string',
                        example: 'API key will only be shown once. Save it securely.',
                      },
                    },
                  },
                },
              },
            },
            401: {
              description: 'Authentication required',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error',
                  },
                },
              },
            },
          },
        },
      },
      '/documents': {
        post: {
          tags: ['Documents'],
          summary: 'Upload document',
          description: 'Upload a document for processing',
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    file: {
                      type: 'string',
                      format: 'binary',
                      description: 'Document file (PDF, DOCX, PNG, JPG, TIFF, TXT, HTML)',
                    },
                    metadata: {
                      type: 'string',
                      description: 'JSON string with document metadata',
                    },
                    callback_url: {
                      type: 'string',
                      format: 'url',
                      description: 'Webhook URL for processing completion',
                    },
                    processing_options: {
                      type: 'string',
                      description: 'JSON string with processing options',
                    },
                  },
                },
              },
            },
          },
          responses: {
            202: {
              description: 'Document accepted for processing',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      document_id: { type: 'string' },
                      status: { type: 'string', enum: ['queued'] },
                      estimated_completion_time: {
                        type: 'string',
                        format: 'date-time',
                      },
                      webhook_id: { type: 'string', nullable: true },
                    },
                  },
                },
              },
            },
            400: {
              description: 'Validation error',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error',
                  },
                },
              },
            },
            401: {
              description: 'Authentication required',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error',
                  },
                },
              },
            },
          },
        },
        get: {
          tags: ['Documents'],
          summary: 'List documents',
          description: 'Get a list of documents with pagination',
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          parameters: [
            {
              name: 'status',
              in: 'query',
              schema: {
                type: 'string',
                enum: ['uploaded', 'queued', 'processing', 'completed', 'failed'],
              },
              description: 'Filter by status',
            },
            {
              name: 'limit',
              in: 'query',
              schema: {
                type: 'integer',
                default: 50,
                minimum: 1,
                maximum: 100,
              },
              description: 'Number of documents per page',
            },
            {
              name: 'offset',
              in: 'query',
              schema: { type: 'integer', default: 0, minimum: 0 },
              description: 'Offset for pagination',
            },
            {
              name: 'sort',
              in: 'query',
              schema: {
                type: 'string',
                enum: ['created_at', 'updated_at', 'file_size'],
                default: 'created_at',
              },
              description: 'Field to sort by',
            },
            {
              name: 'order',
              in: 'query',
              schema: {
                type: 'string',
                enum: ['asc', 'desc'],
                default: 'desc',
              },
              description: 'Sort order',
            },
          ],
          responses: {
            200: {
              description: 'List of documents',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      documents: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            document_id: { type: 'string' },
                            original_filename: { type: 'string' },
                            file_size_bytes: { type: 'integer' },
                            file_type: { type: 'string' },
                            status: { type: 'string' },
                            progress: { type: 'integer' },
                            created_at: { type: 'string', format: 'date-time' },
                            updated_at: { type: 'string', format: 'date-time' },
                          },
                        },
                      },
                      total: { type: 'integer' },
                      limit: { type: 'integer' },
                      offset: { type: 'integer' },
                    },
                  },
                },
              },
            },
            401: {
              description: 'Authentication required',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error',
                  },
                },
              },
            },
          },
        },
      },
      '/documents/{id}': {
        get: {
          tags: ['Documents'],
          summary: 'Get document status',
          description: 'Get the status and results of a document',
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Document ID',
            },
          ],
          responses: {
            200: {
              description: 'Document status and results',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/DocumentResponse',
                  },
                },
              },
            },
            404: {
              description: 'Document not found',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error',
                  },
                },
              },
            },
          },
        },
        patch: {
          tags: ['Documents'],
          summary: 'Update document metadata',
          description: 'Update metadata for an existing document',
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Document ID',
            },
          ],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    metadata: {
                      type: 'object',
                      properties: {
                        title: { type: 'string' },
                        description: { type: 'string' },
                        tags: {
                          type: 'array',
                          items: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Document metadata updated',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/DocumentResponse',
                  },
                },
              },
            },
            404: {
              description: 'Document not found',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error',
                  },
                },
              },
            },
          },
        },
        delete: {
          tags: ['Documents'],
          summary: 'Delete document',
          description: 'Delete a document and all associated data',
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Document ID',
            },
          ],
          responses: {
            204: {
              description: 'Document deleted successfully',
            },
            404: {
              description: 'Document not found',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error',
                  },
                },
              },
            },
          },
        },
      },
      '/documents/{id}/download': {
        get: {
          tags: ['Documents'],
          summary: 'Download document',
          description: 'Download the original document file',
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Document ID',
            },
          ],
          responses: {
            200: {
              description: 'Document file',
              content: {
                'application/pdf': {
                  schema: {
                    type: 'string',
                    format: 'binary',
                  },
                },
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
                  schema: {
                    type: 'string',
                    format: 'binary',
                  },
                },
                'image/jpeg': {
                  schema: {
                    type: 'string',
                    format: 'binary',
                  },
                },
                'image/png': {
                  schema: {
                    type: 'string',
                    format: 'binary',
                  },
                },
                'image/tiff': {
                  schema: {
                    type: 'string',
                    format: 'binary',
                  },
                },
                'text/plain': {
                  schema: {
                    type: 'string',
                    format: 'binary',
                  },
                },
                'text/html': {
                  schema: {
                    type: 'string',
                    format: 'binary',
                  },
                },
              },
            },
            404: {
              description: 'Document not found',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error',
                  },
                },
              },
            },
          },
        },
      },
      '/search': {
        get: {
          tags: ['Search'],
          summary: 'Search documents',
          description: 'Search across processed documents',
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          parameters: [
            {
              name: 'q',
              in: 'query',
              schema: { type: 'string' },
              description: 'Search query',
            },
            {
              name: 'field',
              in: 'query',
              schema: {
                type: 'string',
                enum: ['content', 'metadata', 'entities'],
                default: 'content',
              },
              description: 'Field to search in',
            },
            {
              name: 'date_from',
              in: 'query',
              schema: { type: 'string', format: 'date-time' },
              description: 'Filter by creation date (from)',
            },
            {
              name: 'date_to',
              in: 'query',
              schema: { type: 'string', format: 'date-time' },
              description: 'Filter by creation date (to)',
            },
            {
              name: 'page',
              in: 'query',
              schema: { type: 'integer', default: 1, minimum: 1 },
              description: 'Page number',
            },
            {
              name: 'size',
              in: 'query',
              schema: {
                type: 'integer',
                default: 20,
                minimum: 1,
                maximum: 100,
              },
              description: 'Results per page',
            },
          ],
          responses: {
            200: {
              description: 'Search results',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/SearchResponse',
                  },
                },
              },
            },
          },
        },
      },
      '/stats/documents': {
        get: {
          tags: ['Documents'],
          summary: 'Get document statistics',
          description: 'Get statistics about documents for the authenticated user',
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          responses: {
            200: {
              description: 'Document statistics',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      total_documents: {
                        type: 'integer',
                        example: 42,
                      },
                      total_size_bytes: {
                        type: 'integer',
                        example: 104857600,
                      },
                      by_status: {
                        type: 'object',
                        additionalProperties: {
                          type: 'integer',
                        },
                        example: {
                          uploaded: 5,
                          queued: 3,
                          processing: 2,
                          completed: 30,
                          failed: 2,
                        },
                      },
                      by_type: {
                        type: 'object',
                        additionalProperties: {
                          type: 'integer',
                        },
                        example: {
                          'application/pdf': 25,
                          'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 10,
                          'image/jpeg': 5,
                          'image/png': 2,
                        },
                      },
                      recent_activity: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            date: { type: 'string', format: 'date' },
                            count: { type: 'integer' },
                            size_bytes: { type: 'integer' },
                          },
                        },
                        example: [
                          { date: '2026-04-13', count: 5, size_bytes: 5242880 },
                          { date: '2026-04-12', count: 3, size_bytes: 3145728 },
                          { date: '2026-04-11', count: 7, size_bytes: 7340032 },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/health': {
        get: {
          tags: ['System'],
          summary: 'Health check',
          description: 'Check if the API is running',
          responses: {
            200: {
              description: 'API is healthy',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'healthy' },
                      timestamp: { type: 'string', format: 'date-time' },
                      service: { type: 'string' },
                      version: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/admin/queues/stats': {
        get: {
          tags: ['Admin'],
          summary: 'Get queue statistics',
          description: 'Get statistics about processing queues (admin only)',
          security: [{ BearerAuth: [] }],
          responses: {
            200: {
              description: 'Queue statistics',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      processing: {
                        type: 'object',
                        properties: {
                          waiting: { type: 'integer' },
                          active: { type: 'integer' },
                          completed: { type: 'integer' },
                          failed: { type: 'integer' },
                          delayed: { type: 'integer' },
                        },
                      },
                      ai_analysis: {
                        type: 'object',
                        properties: {
                          waiting: { type: 'integer' },
                          active: { type: 'integer' },
                          completed: { type: 'integer' },
                          failed: { type: 'integer' },
                          delayed: { type: 'integer' },
                        },
                      },
                      webhook_delivery: {
                        type: 'object',
                        properties: {
                          waiting: { type: 'integer' },
                          active: { type: 'integer' },
                          completed: { type: 'integer' },
                          failed: { type: 'integer' },
                          delayed: { type: 'integer' },
                        },
                      },
                      timestamp: {
                        type: 'string',
                        format: 'date-time',
                      },
                    },
                  },
                },
              },
            },
            401: {
              description: 'Authentication required',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error',
                  },
                },
              },
            },
            403: {
              description: 'Admin access required',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error',
                  },
                },
              },
            },
          },
        },
      },
      '/admin/queues/clean': {
        post: {
          tags: ['Admin'],
          summary: 'Clean old queue jobs',
          description: 'Clean completed/failed jobs older than specified age (admin only)',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ageInHours: {
                      type: 'integer',
                      minimum: 1,
                      maximum: 720,
                      default: 24,
                      example: 24,
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Jobs cleaned successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      cleaned: {
                        type: 'integer',
                        example: 125,
                      },
                      ageInHours: {
                        type: 'integer',
                        example: 24,
                      },
                    },
                  },
                },
              },
            },
            401: {
              description: 'Authentication required',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error',
                  },
                },
              },
            },
            403: {
              description: 'Admin access required',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error',
                  },
                },
              },
            },
          },
        },
      },
      '/admin/system/info': {
        get: {
          tags: ['Admin'],
          summary: 'Get system information',
          description: 'Get detailed system information and health status (admin only)',
          security: [{ BearerAuth: [] }],
          responses: {
            200: {
              description: 'System information',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      database: {
                        type: 'object',
                        properties: {
                          connected: { type: 'boolean' },
                          timestamp: { type: 'string', format: 'date-time' },
                        },
                      },
                      storage: {
                        type: 'object',
                        properties: {
                          bucket: { type: 'string' },
                          totalSizeBytes: { type: 'integer' },
                        },
                      },
                      redis: {
                        type: 'object',
                        properties: {
                          connected: { type: 'boolean' },
                        },
                      },
                      system: {
                        type: 'object',
                        properties: {
                          nodeVersion: { type: 'string' },
                          platform: { type: 'string' },
                          memory: {
                            type: 'object',
                            properties: {
                              rss: { type: 'integer' },
                              heapTotal: { type: 'integer' },
                              heapUsed: { type: 'integer' },
                              external: { type: 'integer' },
                            },
                          },
                          uptime: { type: 'number' },
                        },
                      },
                    },
                  },
                },
              },
            },
            401: {
              description: 'Authentication required',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error',
                  },
                },
              },
            },
            403: {
              description: 'Admin access required',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error',
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  apis: ['./src/api/routes/*.ts', './src/api/controllers/*.ts'],
};

const swaggerSpec = swaggerJsdoc(options);

export function swaggerDocs(app: Application, port: number): void {
  // Swagger page
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // Docs in JSON format
  app.get('/api-docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  logger.info(`Swagger docs available at http://localhost:${port}/api-docs`);
}
