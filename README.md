# Document Intelligence API

A powerful API service for processing documents with OCR and AI analysis.

## Features

- **Document Processing**: Upload and process PDF, DOCX, images, and text files
- **OCR Extraction**: Extract text from scanned documents and images using Tesseract.js
- **AI Analysis**: Entity extraction, summarization, and classification
- **Search**: Full-text search across processed documents
- **Webhooks**: Real-time notifications for processing events
- **Multi-tenancy**: Support for multiple organizations and users
- **RESTful API**: Clean, consistent API design with OpenAPI documentation

## Tech Stack

- **Runtime**: Node.js 20+
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Cache/Queue**: Redis with Bull queue
- **Storage**: AWS S3 compatible storage
- **OCR**: Tesseract.js, PDF.js, Mammoth.js
- **NLP**: Natural, Compromise
- **Documentation**: Swagger/OpenAPI 3.0

## Prerequisites

- Node.js 20.x or higher
- PostgreSQL 15.x or higher
- Redis 7.x or higher
- AWS S3 or compatible storage (MinIO, Cloudflare R2, etc.)

## Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd document-intelligence-api
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Set up database:

```bash
npx prisma generate
npx prisma migrate dev
```

5. Start the development server:

```bash
npm run dev
```

6. Start the processing worker (in another terminal):

```bash
npm run dev:worker
```

## API Documentation

Once the server is running, access the API documentation at:

- Swagger UI: http://localhost:3000/api-docs
- OpenAPI JSON: http://localhost:3000/api-docs.json

## API Endpoints

### Authentication

- `POST /api/v1/auth/token` - Get authentication token
- `POST /api/v1/auth/refresh` - Refresh authentication token

### Documents

- `POST /api/v1/documents` - Upload document for processing
- `GET /api/v1/documents` - List documents with pagination
- `GET /api/v1/documents/{id}` - Get document status and results
- `GET /api/v1/documents/{id}/download` - Download original document
- `PATCH /api/v1/documents/{id}` - Update document metadata
- `DELETE /api/v1/documents/{id}` - Delete document

### Search

- `GET /api/v1/search` - Search across processed documents

### Admin

- `GET /api/v1/admin/queues/stats` - Get queue statistics (admin only)
- `GET /api/v1/admin/system/info` - Get system information (admin only)

## Authentication Methods

### API Key Authentication

1. Include API key in headers:

```
X-API-Key: your_api_key_here
```

### JWT Authentication

1. Get token from `/auth/token` endpoint
2. Include in Authorization header:

```
Authorization: Bearer your_jwt_token_here
```

## Rate Limiting

The API implements tier-based rate limiting:

| Tier       | Requests/Day | Concurrent Jobs |
| ---------- | ------------ | --------------- |
| Free       | 100          | 1               |
| Basic      | 10,000       | 5               |
| Pro        | 100,000      | 20              |
| Enterprise | Custom       | Custom          |

Rate limit headers are included in all responses:

- `X-RateLimit-Limit`: Maximum requests per period
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Time until reset (seconds)
- `Retry-After`: Wait time when limit exceeded (seconds)

## File Processing Pipeline

1. **Upload**: Client uploads document via multipart/form-data
2. **Validation**: Check file size, type, and user quota
3. **Storage**: Save to S3 with unique key
4. **Queue**: Add processing job to Redis queue
5. **OCR Processing**: Extract text based on file type
6. **NLP Analysis**: Extract entities and generate summary
7. **AI Processing** (optional): Apply custom AI models
8. **Completion**: Update database and trigger webhooks

## Webhook Events

Configure webhooks to receive real-time notifications:

| Event                          | Description                      |
| ------------------------------ | -------------------------------- |
| `document.uploaded`            | Document uploaded and queued     |
| `document.processing_started`  | Processing began                 |
| `document.processing_progress` | Progress update (percentage)     |
| `document.completed`           | Processing finished successfully |
| `document.failed`              | Processing failed                |

## Database Schema

The system uses PostgreSQL with the following main tables:

- **users**: User accounts and authentication
- **tenants**: Organizations with multi-tenancy support
- **documents**: Document metadata and processing results
- **processing_jobs**: Queue job tracking
- **api_keys**: API key management
- **webhooks**: Webhook configurations
- **audit_logs**: Audit trail for compliance

## Development

### Running Tests

```bash
npm test              # Run tests once
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
```

### Linting and Formatting

```bash
npm run lint          # Check for linting issues
npm run lint:fix      # Fix linting issues
npm run format        # Format code with Prettier
npm run typecheck     # Type check without building
```

### Building for Production

```bash
npm run build         # Build TypeScript to JavaScript
npm start             # Start production server
```

## Deployment

### Docker

```bash
docker build -t document-intelligence-api .
docker run -p 3000:3000 --env-file .env document-intelligence-api
```

### Kubernetes (Helm)

```bash
helm install doc-intel ./charts --namespace document-intelligence
```

### CI/CD

The project includes GitHub Actions workflows for:

- Automated testing
- Docker image building
- Helm chart deployment
- Database migrations

## Monitoring

### Health Checks

- `GET /health` - Basic health check
- `GET /api/v1/health` - API health check

### Metrics

- Application metrics via Winston/Pino logging
- Queue metrics via Bull dashboard
- Database metrics via Prisma logging
- System metrics via `/admin/system/info`

### Logging

- Structured JSON logging in production
- Console logging in development
- Log rotation and archival
- Audit trail for compliance

## Security

- **Authentication**: API keys, JWT tokens, OAuth 2.0 ready
- **Authorization**: Role-based access control (RBAC)
- **Encryption**: TLS 1.3, encrypted at rest (AES-256)
- **Input Validation**: Strict schema validation with Zod
- **Rate Limiting**: Per API key, per endpoint
- **Audit Logging**: All operations logged with user context
- **Compliance**: GDPR, CCPA, HIPAA-ready architecture

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For support, please:

1. Check the API documentation
2. Review the troubleshooting guide
3. Create an issue in the repository
4. Contact support@document-intelligence.com

---

**Document Intelligence API** - Process documents with intelligence
