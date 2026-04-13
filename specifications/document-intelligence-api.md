# Technical Design Document: Document Intelligence API

**Version**: 1.0  
**Date**: April 13, 2026  
**Author**: Backend Engineer  
**Status**: Draft  
**Decision**: Node.js/Express (per PRIA-29)

## Executive Summary

This document outlines the technical design for a Document Intelligence API service, a $15,000-$25,000 service offering. The system processes documents (PDF, DOCX, images), extracts text using OCR, applies AI analysis, and provides structured data through a RESTful API.

**Key Decision**: Based on PRIA-29, using Node.js/Express instead of Python/FastAPI for:
- Faster implementation with existing templates
- Consistent JavaScript/TypeScript stack
- Alignment with engineering team skills
- Node.js can integrate with Python AI services if needed

## 1. System Architecture

### 1.1 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Applications                      │
│  (Web Apps, Mobile Apps, CLI Tools, Integrations)           │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTPS / REST API
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                 API Gateway / Load Balancer                  │
│  (NGINX, Traefik, or Cloud Load Balancer)                   │
└───────────────────────┬─────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│   API Layer   │ │   API Layer   │ │   API Layer   │
│  Node.js/     │ │  Node.js/     │ │  Node.js/     │
│  Express      │ │  Express      │ │  Express      │
│  (Stateless)  │ │  (Stateless)  │ │  (Stateless)  │
└───────┬───────┘ └───────┬───────┘ └───────┬───────┘
        │                 │                 │
        └─────────────────┼─────────────────┘
                          │ Internal Communication
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                     Service Layer                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Queue     │  │   Cache     │  │   Storage   │        │
│  │   (Redis)   │  │   (Redis)   │  │    (S3)     │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                 │               │
│  ┌──────▼───────────────▼─────────────────▼─────────────┐ │
│  │                Processing Workers                     │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │ │
│  │  │   OCR       │  │   AI/ML     │  │   Quality   │  │ │
│  │  │  (Tesseract,│  │  (OpenAI,   │  │   Control   │  │ │
│  │  │   PDF.js)   │  │   spaCy)    │  │             │  │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │ │
│  └─────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Data Layer                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  PostgreSQL │  │  PostgreSQL │  │  Elastic-   │        │
│  │  (Primary)  │  │  (Read      │  │   search    │        │
│  │             │  │   Replica)  │  │             │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Component Breakdown

#### 1.2.1 API Layer (Node.js/Express)
- **Purpose**: Handle HTTP requests, authentication, rate limiting, request validation
- **Technology**: Node.js 20+, Express 4.x, TypeScript
- **Scaling**: Stateless, horizontally scalable
- **Features**:
  - OpenAPI 3.0 documentation with Swagger UI
  - Request validation with Zod
  - Authentication middleware (API keys, JWT, OAuth 2.0)
  - Rate limiting with Redis
  - Comprehensive logging with Winston/Pino
  - Error handling with structured responses

#### 1.2.2 Processing Layer
- **Purpose**: Asynchronous document processing
- **Technology**: Bull Queue (Redis-based), Worker threads
- **Workers**:
  1. **OCR Worker**: Text extraction from PDF, DOCX, images
  2. **AI Worker**: Natural language processing, entity extraction
  3. **Quality Worker**: Validation, formatting, enrichment

#### 1.2.3 Data Layer
- **Primary Database**: PostgreSQL 15+ with JSONB support
- **Cache**: Redis 7+ for sessions, rate limiting, job queues
- **Search**: Elasticsearch 8.x for document content search
- **Storage**: S3-compatible (AWS S3, MinIO, Cloudflare R2)

#### 1.2.4 External Services
- **AI/ML**: OpenAI GPT-4, spaCy (via Python microservice if needed)
- **OCR**: Tesseract 5, PDF.js, Apache Tika
- **Monitoring**: Prometheus, Grafana, Sentry
- **CI/CD**: GitHub Actions, Docker, Kubernetes

### 1.3 Data Flow

1. **Document Upload**:
   ```
   Client → API Gateway → API Layer → S3 Storage → Queue → Processing Workers
   ```

2. **Processing Pipeline**:
   ```
   Document → OCR Extraction → Text Normalization → AI Analysis → Quality Check → Database Storage
   ```

3. **Result Retrieval**:
   ```
   Client → API Layer → Database/Elasticsearch → Formatted Response
   ```

### 1.4 Security Considerations

- **Authentication**: API keys, JWT, OAuth 2.0
- **Authorization**: Role-based access control (RBAC)
- **Data Encryption**: TLS 1.3, encrypted at rest (AES-256)
- **Input Validation**: Strict schema validation for all inputs
- **Rate Limiting**: Per API key, per endpoint
- **Audit Logging**: All operations logged with user context
- **Compliance**: GDPR, CCPA, HIPAA-ready architecture

## 2. Technology Stack Selection

### 2.1 Backend Framework: Node.js/Express

**Selected**: Node.js with Express.js  
**Rationale**:
- **Template Availability**: Portfolio template (`portfolio-templates/api-service/`) available
- **Consistency**: JavaScript/TypeScript across full stack
- **Performance**: Node.js handles I/O-bound tasks efficiently
- **Ecosystem**: Rich NPM ecosystem, strong TypeScript support
- **Team Skills**: Aligns with engineering team capabilities

**Alternatives Considered**:
- **FastAPI/Python**: Strong for AI/ML but no template, slower implementation
- **NestJS**: More opinionated, steeper learning curve
- **Go**: Better performance but less ecosystem for document processing

### 2.2 Database: PostgreSQL with JSONB

**Selected**: PostgreSQL 15+  
**Features**:
- **JSONB**: Native JSON support for flexible document metadata
- **Full-text Search**: Built-in for basic search requirements
- **Relations**: Strong relational model for user/tenant management
- **Extensions**: `pgvector` for vector embeddings if needed
- **Replication**: Built-in for read scaling

**Schema Design Principles**:
- Normalized tables for core entities
- JSONB for variable document metadata
- Indexes on frequently queried fields
- Partitioning for large tables (documents, processing_jobs)

### 2.3 Cache Layer: Redis

**Selected**: Redis 7+  
**Use Cases**:
- **Session Storage**: User sessions, API key validation
- **Rate Limiting**: Token bucket implementation
- **Job Queues**: Bull queue for processing jobs
- **Response Cache**: API response caching
- **Pub/Sub**: Real-time notifications

### 2.4 Search: Elasticsearch

**Selected**: Elasticsearch 8.x  
**Rationale**:
- **Full-text Search**: Advanced search across document content
- **Aggregations**: Analytics on processed documents
- **Scalability**: Distributed, horizontally scalable
- **Integration**: Good Node.js client support

**Alternative**: PostgreSQL full-text search (simpler but less powerful)

### 2.5 Queue System: Bull (Redis)

**Selected**: Bull Queue  
**Features**:
- **Priority Queues**: Different priorities for processing jobs
- **Retry Logic**: Automatic retries with exponential backoff
- **Progress Tracking**: Job progress monitoring
- **Delayed Jobs**: Scheduled processing
- **Web UI**: Bull Arena for monitoring

### 2.6 Storage: S3-compatible

**Selected**: S3 API compatible storage  
**Options**:
- **AWS S3**: Production, enterprise features
- **Cloudflare R2**: Zero egress fees, good for CDN
- **MinIO**: Self-hosted option, good for development
- **Backblaze B2**: Cost-effective alternative

**Storage Strategy**:
- Original documents: S3 Standard
- Processed text: S3 Standard-IA (infrequent access)
- Backups: S3 Glacier for compliance

### 2.7 AI/ML Services

**Hybrid Approach**:
1. **Node.js Native**: Lightweight NLP with `natural`, `compromise`
2. **External Services**: OpenAI API, Google Cloud Natural Language
3. **Python Microservice** (Optional): Heavy NLP with spaCy, custom models

**AI Capabilities**:
- **Entity Extraction**: People, organizations, dates, amounts
- **Sentiment Analysis**: Document tone, sentiment scoring
- **Classification**: Document type, topic, urgency
- **Summarization**: Key points, executive summaries
- **Translation**: Multi-language support

## 3. API Design

### 3.1 RESTful Endpoint Specifications

**Base URL**: `https://api.document-intelligence.com/v1`

#### 3.1.1 Authentication
```
POST /auth/token
Content-Type: application/json

{
  "api_key": "your_api_key"
}

Response:
{
  "access_token": "jwt_token",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

#### 3.1.2 Document Management

**Upload Document**:
```
POST /documents
Content-Type: multipart/form-data
Authorization: Bearer {token}

Parameters:
- file: Document file (PDF, DOCX, PNG, JPG, TIFF)
- metadata (optional): JSON string with document metadata
- callback_url (optional): Webhook URL for processing completion

Response:
{
  "document_id": "doc_123",
  "status": "queued",
  "estimated_completion_time": "2026-04-13T16:30:00Z",
  "webhook_id": "wh_456"
}
```

**Get Document Status**:
```
GET /documents/{document_id}
Authorization: Bearer {token}

Response:
{
  "document_id": "doc_123",
  "status": "processing|completed|failed",
  "progress": 75,
  "result": {
    "extracted_text": "Full extracted text...",
    "entities": [
      {"type": "PERSON", "value": "John Doe", "confidence": 0.95}
    ],
    "summary": "Document summary...",
    "metadata": {...}
  },
  "error_message": null,
  "created_at": "2026-04-13T15:30:00Z",
  "completed_at": "2026-04-13T16:25:00Z"
}
```

**List Documents**:
```
GET /documents
Authorization: Bearer {token}
Query Parameters:
- status: filter by status
- limit: pagination limit (default: 50)
- offset: pagination offset (default: 0)
- sort: created_at|updated_at (default: created_at)
- order: asc|desc (default: desc)

Response:
{
  "documents": [...],
  "total": 1250,
  "limit": 50,
  "offset": 0
}
```

#### 3.1.3 Search Endpoints

**Search Documents**:
```
GET /search
Authorization: Bearer {token}
Query Parameters:
- q: search query
- field: content|metadata|entities (default: content)
- date_from: filter by date
- date_to: filter by date
- page: pagination page (default: 1)
- size: results per page (default: 20)

Response:
{
  "results": [...],
  "total": 245,
  "page": 1,
  "size": 20,
  "took_ms": 45
}
```

**Advanced Search**:
```
POST /search/advanced
Authorization: Bearer {token}
Content-Type: application/json

{
  "query": {
    "bool": {
      "must": [
        {"match": {"content": "contract terms"}},
        {"range": {"created_at": {"gte": "2026-01-01"}}}
      ]
    }
  },
  "aggregations": {
    "by_type": {"terms": {"field": "document_type"}}
  }
}
```

### 3.2 Request/Response Schemas

**Document Upload Request**:
```typescript
interface DocumentUploadRequest {
  file: File;
  metadata?: {
    title?: string;
    description?: string;
    tags?: string[];
    language?: string;
    document_type?: string;
    custom_fields?: Record<string, any>;
  };
  callback_url?: string;
  processing_options?: {
    ocr_engine?: 'tesseract' | 'pdfjs' | 'auto';
    language_hint?: string;
    extract_tables?: boolean;
    extract_images?: boolean;
    ai_models?: string[];
  };
}
```

**Document Response**:
```typescript
interface DocumentResponse {
  document_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress?: number;
  result?: {
    extracted_text: string;
    entities: Entity[];
    summary: string;
    metadata: Record<string, any>;
    tables?: Table[];
    images?: ImageMetadata[];
    processing_time_ms: number;
  };
  error_message?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}
```

**Entity**:
```typescript
interface Entity {
  type: 'PERSON' | 'ORGANIZATION' | 'DATE' | 'MONEY' | 'LOCATION';
  value: string;
  confidence: number;
  start_offset: number;
  end_offset: number;
}
```

### 3.3 Error Handling Patterns

**Error Response Structure**:
```typescript
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
    request_id: string;
    timestamp: string;
  };
}
```

**Common Error Codes**:
- `validation_error`: Request validation failed
- `authentication_error`: Invalid or missing credentials
- `authorization_error`: Insufficient permissions
- `rate_limit_exceeded`: Too many requests
- `document_not_found`: Document does not exist
- `processing_error`: Document processing failed
- `service_unavailable`: Temporary service issue

**Example Error Response**:
```json
{
  "error": {
    "code": "validation_error",
    "message": "Invalid request parameters",
    "details": {
      "field": "file",
      "issue": "File exceeds maximum size of 100MB"
    },
    "request_id": "req_789",
    "timestamp": "2026-04-13T15:45:30Z"
  }
}
```

### 3.4 Rate Limiting Strategy

**Tiers**:
1. **Free Tier**: 100 requests/day, 1 concurrent processing job
2. **Basic Tier**: 10,000 requests/day, 5 concurrent jobs
3. **Pro Tier**: 100,000 requests/day, 20 concurrent jobs
4. **Enterprise**: Custom limits, SLA guarantees

**Implementation**:
- **Algorithm**: Token bucket with Redis
- **Headers**:
  ```
  X-RateLimit-Limit: 10000
  X-RateLimit-Remaining: 9850
  X-RateLimit-Reset: 1736852400
  Retry-After: 60
  ```

**Rate Limit Keys**:
- Per API key
- Per endpoint (different limits for upload vs search)
- Burst allowance for short spikes

### 3.5 Authentication/Authorization

**Authentication Methods**:
1. **API Keys**: Simple, for server-to-server communication
2. **JWT**: For user sessions, mobile apps
3. **OAuth 2.0**: For third-party integrations

**Authorization Model**:
- **Roles**: Admin, User, Viewer
- **Permissions**: Create, Read, Update, Delete, Search
- **Scopes**: documents:read, documents:write, search:full

**Implementation**:
```typescript
// Middleware example
const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    throw new AuthenticationError('Missing authentication token');
  }
  
  const user = await verifyToken(token);
  req.user = user;
  next();
};

// Role-based authorization
const authorize = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes(req.user.role)) {
      throw new AuthorizationError('Insufficient permissions');
    }
    next();
  };
};
```

### 3.6 Versioning Approach

**URL Versioning**: `/v1/`, `/v2/`
- Clear, explicit
- Easy deprecation management
- Header-based content negotiation optional

**Deprecation Policy**:
1. **Announcement**: 6 months before deprecation
2. **Deprecated**: Available but with warning headers
3. **Removed**: After 12 months from announcement

**Version Headers**:
```
Accept: application/vnd.document-intelligence.v1+json
X-API-Version: 1
```

## 4. Data Model

### 4.1 PostgreSQL Schema Design

**ORM Selection**: Prisma ORM  
**Rationale**: Type-safe, migrations, good TypeScript support, active development

#### 4.1.1 Core Tables

**Users Table**:
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  hashed_password VARCHAR(255),
  api_key VARCHAR(64) UNIQUE,
  role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'user', 'viewer')),
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_api_key ON users(api_key);
CREATE INDEX idx_users_created_at ON users(created_at);
```

**Tenants/Organizations Table** (for multi-tenancy):
```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  plan VARCHAR(50) DEFAULT 'free' CHECK (plan IN ('free', 'basic', 'pro', 'enterprise')),
  settings JSONB DEFAULT '{
    "max_documents": 1000,
    "max_file_size_mb": 100,
    "concurrent_jobs": 1,
    "retention_days": 30
  }',
  billing_info JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
```

**Documents Table**:
```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- File information
  original_filename VARCHAR(500) NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  file_type VARCHAR(100) NOT NULL,
  storage_key VARCHAR(500) NOT NULL UNIQUE,
  storage_bucket VARCHAR(100) DEFAULT 'documents',
  
  -- Processing status
  status VARCHAR(50) DEFAULT 'uploaded' CHECK (
    status IN ('uploaded', 'queued', 'processing', 'completed', 'failed')
  ),
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  error_message TEXT,
  
  -- Processing results (JSONB for flexibility)
  extracted_text TEXT,
  entities JSONB DEFAULT '[]',
  summary TEXT,
  metadata JSONB DEFAULT '{}',
  processing_stats JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processing_started_at TIMESTAMP WITH TIME ZONE,
  processing_completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Indexes
  CONSTRAINT fk_documents_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_documents_user FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Indexes for common queries
CREATE INDEX idx_documents_tenant_id ON documents(tenant_id);
CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_created_at ON documents(created_at);
CREATE INDEX idx_documents_metadata_gin ON documents USING GIN (metadata);
CREATE INDEX idx_documents_entities_gin ON documents USING GIN (entities);
```

**Processing Jobs Table**:
```sql
CREATE TABLE processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  job_type VARCHAR(50) NOT NULL CHECK (job_type IN ('ocr', 'ai_analysis', 'quality_check')),
  status VARCHAR(50) DEFAULT 'pending' CHECK (
    status IN ('pending', 'running', 'completed', 'failed', 'retrying')
  ),
  priority INTEGER DEFAULT 0,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  error_message TEXT,
  input_data JSONB,
  output_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  CONSTRAINT fk_processing_jobs_document FOREIGN KEY (document_id) REFERENCES documents(id)
);

CREATE INDEX idx_processing_jobs_document_id ON processing_jobs(document_id);
CREATE INDEX idx_processing_jobs_status ON processing_jobs(status);
CREATE INDEX idx_processing_jobs_priority_status ON processing_jobs(priority, status);
```

#### 4.1.2 Supporting Tables

**API Keys Table**:
```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  key_hash VARCHAR(255) NOT NULL UNIQUE,
  prefix VARCHAR(8) NOT NULL,
  scopes JSONB DEFAULT '["documents:read", "documents:write"]',
  rate_limit_per_day INTEGER DEFAULT 10000,
  last_used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT fk_api_keys_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_prefix ON api_keys(prefix);
```

**Webhooks Table**:
```sql
CREATE TABLE webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  url VARCHAR(500) NOT NULL,
  event_types JSONB DEFAULT '["document.completed", "document.failed"]',
  secret_token VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'failed')),
  last_triggered_at TIMESTAMP WITH TIME ZONE,
  failure_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT fk_webhooks_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE INDEX idx_webhooks_tenant_id ON webhooks(tenant_id);
```

**Audit Log Table**:
```sql
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100),
  resource_id UUID,
  details JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Partition by month for large volumes
CREATE TABLE audit_logs_2026_04 PARTITION OF audit_logs
FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE INDEX idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
```

#### 4.1.3 Prisma Schema Example

```prisma
// schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id                String    @id @default(uuid())
  email             String    @unique
  hashedPassword    String?
  apiKey            String?   @unique
  role              Role      @default(USER)
  status            UserStatus @default(ACTIVE)
  metadata          Json      @default("{}")
  tenants           Tenant[]  @relation("UserTenants")
  documents         Document[]
  apiKeys           ApiKey[]
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  lastLoginAt       DateTime?

  @@index([email])
  @@index([apiKey])
  @@index([createdAt])
}

model Tenant {
  id          String   @id @default(uuid())
  name        String
  slug        String   @unique
  plan        Plan     @default(FREE)
  settings    Json     @default("{}")
  billingInfo Json?
  users       User[]   @relation("UserTenants")
  documents   Document[]
  webhooks    Webhook[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([slug])
}

model Document {
  id                     String         @id @default(uuid())
  tenantId               String
  userId                 String
  originalFilename       String
  fileSizeBytes          Int
  fileType               String
  storageKey             String         @unique
  storageBucket          String         @default("documents")
  status                 DocumentStatus @default(UPLOADED)
  progress               Int            @default(0)
  errorMessage           String?
  extractedText          String?
  entities               Json           @default("[]")
  summary                String?
  metadata               Json           @default("{}")
  processingStats        Json           @default("{}")
  tenant                 Tenant         @relation(fields: [tenantId], references: [id])
  user                   User           @relation(fields: [userId], references: [id])
  processingJobs         ProcessingJob[]
  createdAt              DateTime       @default(now())
  updatedAt              DateTime       @updatedAt
  processingStartedAt    DateTime?
  processingCompletedAt  DateTime?

  @@index([tenantId])
  @@index([userId])
  @@index([status])
  @@index([createdAt])
}

enum Role {
  ADMIN
  USER
  VIEWER
}

enum UserStatus {
  ACTIVE
  SUSPENDED
  DELETED
}

enum Plan {
  FREE
  BASIC
  PRO
  ENTERPRISE
}

enum DocumentStatus {
  UPLOADED
  QUEUED
  PROCESSING
  COMPLETED
  FAILED
}
```

### 4.2 Document Storage Structure

**S3 Storage Organization**:
```
s3://document-intelligence-{env}/
├── documents/
│   ├── {tenant_id}/
│   │   ├── {year}/{month}/{day}/
│   │   │   └── {document_id}.{ext}          # Original document
│   │   └── processed/
│   │       └── {year}/{month}/{day}/
│   │           └── {document_id}.json       # Processing results
├── cache/
│   └── thumbnails/
│       └── {document_id}.jpg               # Document previews
└── backups/
    └── {year}-{month}-{day}/
        └── database-dump.sql               # Daily backups
```

**File Naming Convention**:
- Original: `{document_id}_{timestamp}_{original_filename}`
- Processed: `{document_id}_processed_{timestamp}.json`
- Thumbnails: `{document_id}_thumbnail_{size}.jpg`

**Storage Policies**:
- **Original documents**: Keep for 90 days (configurable per tenant)
- **Processed results**: Keep indefinitely (compressed JSON)
- **Temporary files**: Auto-delete after 24 hours
- **Backups**: 30-day retention with monthly archives

### 4.3 Processing Job Tracking

**Job States**:
1. **Pending**: Created, waiting in queue
2. **Running**: Currently being processed
3. **Completed**: Successfully finished
4. **Failed**: Processing failed
5. **Retrying**: Failed, scheduled for retry

**Job Priority Levels**:
- **0**: Real-time (highest priority)
- **1**: Interactive (user waiting)
- **2**: Batch processing (overnight)
- **3**: Archive/reprocessing (lowest priority)

**Retry Logic**:
- Exponential backoff: 1min, 5min, 15min, 1hr
- Max attempts: 3 (configurable)
- Dead letter queue for permanent failures

### 4.4 User/Tenant Management

**Multi-tenancy Strategy**: Database-level isolation
- **Schema per tenant**: Most secure, most complex
- **Row-level security**: Good balance, using `tenant_id` foreign keys
- **Shared schema with partitioning**: Good performance, less isolation

**Selected**: Row-level security with `tenant_id` foreign keys
- Simpler implementation
- Good enough isolation for SaaS
- Easier analytics across tenants
- Using middleware to enforce tenant context

**Authentication Flow**:
1. API key lookup → User → Tenant
2. Validate user has access to tenant
3. Set tenant context for all subsequent operations
4. Apply tenant-specific rate limits and quotas

### 4.5 Audit Logging

**Logged Actions**:
- Document uploads/downloads
- API key creation/revocation
- User authentication attempts
- Configuration changes
- Processing job status changes
- Billing events

**Log Structure**:
```json
{
  "timestamp": "2026-04-13T15:45:30Z",
  "tenant_id": "tenant_123",
  "user_id": "user_456",
  "action": "document.upload",
  "resource_type": "document",
  "resource_id": "doc_789",
  "details": {
    "filename": "contract.pdf",
    "file_size": 2048576,
    "processing_options": {...}
  },
  "ip_address": "192.168.1.100",
  "user_agent": "Mozilla/5.0...",
  "request_id": "req_abc123"
}
```

**Retention Policy**:
- **90 days**: Detailed logs in PostgreSQL
- **1 year**: Aggregated logs in Elasticsearch
- **7 years**: Compliance logs in cold storage (S3 Glacier)

## 5. Processing Pipeline Design

### 5.1 Document Upload Flow

**Step-by-Step Process**:
1. **Upload Request**: Client POSTs document to `/documents` endpoint
2. **Validation**: Check file size, type, user quota
3. **Storage**: Upload to S3 with unique storage key
4. **Database Record**: Create document record with `status: uploaded`
5. **Queue Job**: Add processing job to Redis queue
6. **Response**: Return document ID with initial status

**Code Example**:
```typescript
async function uploadDocument(file: Express.Multer.File, userId: string, tenantId: string) {
  // 1. Validate
  await validateFile(file, userId, tenantId);
  
  // 2. Generate storage key
  const storageKey = `${tenantId}/${Date.now()}_${file.originalname}`;
  
  // 3. Upload to S3
  await s3Client.putObject({
    Bucket: process.env.S3_BUCKET,
    Key: storageKey,
    Body: file.buffer,
    ContentType: file.mimetype,
  });
  
  // 4. Create database record
  const document = await prisma.document.create({
    data: {
      tenantId,
      userId,
      originalFilename: file.originalname,
      fileSizeBytes: file.size,
      fileType: file.mimetype,
      storageKey,
      status: 'UPLOADED',
    },
  });
  
  // 5. Queue processing job
  await processingQueue.add('process_document', {
    documentId: document.id,
    tenantId,
    storageKey,
  }, {
    jobId: `doc_${document.id}`,
    priority: 1, // Interactive priority
  });
  
  return document;
}
```

### 5.2 OCR/Text Extraction Workflow

**Supported Formats**:
- **PDF**: PDF.js for browser-based extraction
- **DOCX**: Mammoth.js for Word documents
- **Images**: Tesseract.js for OCR
- **HTML**: Cheerio for web content

**Processing Steps**:
1. **Format Detection**: Determine document type
2. **Text Extraction**: Use appropriate library
3. **Text Cleaning**: Remove noise, normalize encoding
4. **Structure Preservation**: Maintain paragraphs, headings
5. **Quality Scoring**: Calculate confidence scores

**Worker Implementation**:
```typescript
class OCRWorker {
  async process(job: Job) {
    const { documentId, storageKey } = job.data;
    
    // Update status
    await prisma.document.update({
      where: { id: documentId },
      data: { status: 'PROCESSING', processingStartedAt: new Date() },
    });
    
    try {
      // Download from S3
      const fileBuffer = await s3Client.getObject({
        Bucket: process.env.S3_BUCKET,
        Key: storageKey,
      });
      
      // Detect format and extract
      const format = await detectFormat(fileBuffer);
      const extractedText = await this.extractText(fileBuffer, format);
      
      // Clean and normalize
      const cleanedText = this.cleanText(extractedText);
      
      // Update document
      await prisma.document.update({
        where: { id: documentId },
        data: {
          extractedText: cleanedText,
          progress: 50, // Halfway done
          processingStats: {
            ocrEngine: format.detected,
            confidence: format.confidence,
            processingTimeMs: Date.now() - job.timestamp,
          },
        },
      });
      
      // Queue next step (AI analysis)
      await aiQueue.add('analyze_document', {
        documentId,
        extractedText: cleanedText,
      });
      
    } catch (error) {
      await this.handleError(documentId, error);
      throw error; // Bull will retry
    }
  }
}
```

### 5.3 AI Processing Pipeline

**Analysis Stages**:
1. **Entity Extraction**: Names, dates, amounts, organizations
2. **Sentiment Analysis**: Document tone, emotional content
3. **Classification**: Document type, topic, urgency
4. **Summarization**: Key points, executive summary
5. **Relation Extraction**: Connections between entities

**AI Service Integration**:
```typescript
interface AIService {
  analyzeText(text: string): Promise<AnalysisResult>;
}

class OpenAIService implements AIService {
  async analyzeText(text: string): Promise<AnalysisResult> {
    const prompt = `Analyze this document and extract:
    1. Key entities (people, organizations, dates, amounts)
    2. Document sentiment (positive, negative, neutral)
    3. Main topics
    4. 3-sentence summary
    
    Document: ${text.substring(0, 4000)}`; // Truncate for token limits
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1, // Low for consistent results
    });
    
    return this.parseResponse(response.choices[0].message.content);
  }
}
```

### 5.4 Quality Control System

**Validation Checks**:
1. **Text Quality**: Minimum length, language detection
2. **Entity Validation**: Cross-check extracted entities
3. **Confidence Scoring**: Overall processing confidence
4. **Anomaly Detection**: Unusual patterns or errors

**Quality Metrics**:
- **OCR Confidence**: Character recognition accuracy
- **Entity Coverage**: Percentage of text covered by entities
- **Summary Coherence**: Readability and relevance
- **Processing Time**: Efficiency metrics

### 5.5 Webhook/Notification System

**Event Types**:
- `document.uploaded`: Document received
- `document.processing_started`: Processing began
- `document.processing_progress`: Progress update
- `document.completed`: Processing finished
- `document.failed`: Processing failed

**Webhook Delivery**:
```typescript
async function triggerWebhook(tenantId: string, eventType: string, payload: any) {
  const webhooks = await prisma.webhook.findMany({
    where: {
      tenantId,
      status: 'ACTIVE',
      eventTypes: { has: eventType },
    },
  });
  
  for (const webhook of webhooks) {
    try {
      await axios.post(webhook.url, {
        event: eventType,
        data: payload,
        timestamp: new Date().toISOString(),
      }, {
        headers: {
          'X-Webhook-Signature': createSignature(payload, webhook.secretToken),
        },
        timeout: 5000,
      });
      
      await prisma.webhook.update({
        where: { id: webhook.id },
        data: { lastTriggeredAt: new Date() },
      });
      
    } catch (error) {
      await this.handleWebhookError(webhook, error);
    }
  }
}
```

## 6. Deployment Architecture

### 6.1 Containerization (Docker)

**Dockerfile**:
```dockerfile
# API Service
FROM node:20-alpine AS api
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]

# Processing Worker
FROM node:20-alpine AS worker
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
CMD ["npm", "run", "worker"]

# Docker Compose
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: document_intelligence
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
  
  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
  
  api:
    build:
      context: .
      target: api
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://app:${DB_PASSWORD}@postgres/document_intelligence
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
    depends_on:
      - postgres
      - redis
  
  worker:
    build:
      context: .
      target: worker
    environment:
      DATABASE_URL: postgresql://app:${DB_PASSWORD}@postgres/document_intelligence
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
    depends_on:
      - postgres
      - redis
    scale: 3  # Multiple workers for parallel processing
```

### 6.2 Orchestration (Kubernetes)

**Development**: Docker Compose  
**Production**: Kubernetes with Helm

**Kubernetes Resources**:
- **Deployments**: API, Workers, Background jobs
- **Services**: Load balancing, service discovery
- **ConfigMaps/Secrets**: Configuration, credentials
- **PersistentVolumeClaims**: Database storage
- **HorizontalPodAutoscaler**: Auto-scaling based on load
- **Ingress**: External traffic routing

**Helm Chart Structure**:
```
document-intelligence/
├── Chart.yaml
├── values.yaml
├── templates/
│   ├── deployment-api.yaml
│   ├── deployment-worker.yaml
│   ├── service-api.yaml
│   ├── ingress.yaml
│   ├── configmap.yaml
│   └── secrets.yaml
└── requirements.yaml
```

### 6.3 CI/CD Pipeline

**GitHub Actions Workflow**:
```yaml
name: Deploy
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with: { node-version: '20' }
      - run: npm ci
      - run: npm test
      - run: npm run build
  
  deploy-staging:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v3
      - run: helm upgrade --install doc-intel ./charts --namespace staging
  
  deploy-production:
    needs: deploy-staging
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v3
      - run: helm upgrade --install doc-intel ./charts --namespace production
```

### 6.4 Monitoring/Observability

**Metrics Collection**:
- **Application**: Response times, error rates, queue lengths
- **Infrastructure**: CPU, memory, disk I/O, network
- **Business**: Documents processed, active users, revenue

**Tools Stack**:
- **Prometheus**: Metrics collection
- **Grafana**: Dashboards and visualization
- **ELK Stack**: Log aggregation (Elasticsearch, Logstash, Kibana)
- **Sentry**: Error tracking and performance monitoring
- **Uptime Robot**: External health checks

**Key Dashboards**:
1. **System Health**: Uptime, error rates, response times
2. **Processing Pipeline**: Queue lengths, job completion times
3. **Business Metrics**: Active users, document volume, revenue
4. **Infrastructure**: Resource utilization, cost tracking

### 6.5 Backup/Recovery Strategy

**Backup Schedule**:
- **Database**: Hourly incremental, daily full
- **Documents**: Real-time replication, daily snapshots
- **Configuration**: Version-controlled in Git

**Recovery Objectives**:
- **RTO (Recovery Time Objective)**: 4 hours
- **RPO (Recovery Point Objective)**: 1 hour

**Disaster Recovery Plan**:
1. **Failover**: Automatic to secondary region
2. **Data Restoration**: From backups with verification
3. **Service Recovery**: Gradual ramp-up of services
4. **Validation**: Comprehensive testing post-recovery

## 7. Development Phasing

### 7.1 MVP Scope (Phase 1 - 4 Weeks)

**Core Features**:
1. **Document Upload**: Basic file upload and storage
2. **OCR Processing**: Text extraction from common formats
3. **Basic API**: REST endpoints for upload and retrieval
4. **Authentication**: API key-based authentication
5. **Database**: PostgreSQL with basic schema

**Success Criteria**:
- Upload PDF and get extracted text
- API documentation available
- Basic monitoring in place
- Deployment pipeline working

### 7.2 Phase 2 Enhancements (Weeks 5-8)

**Advanced Features**:
1. **AI Integration**: Entity extraction and summarization
2. **Search**: Full-text search across documents
3. **Webhooks**: Event notifications
4. **User Management**: Multi-user, roles, permissions
5. **Rate Limiting**: Tier-based quotas

**Success Criteria**:
- AI processing pipeline operational
- Search functionality working
- Multi-tenant support
- Comprehensive API coverage

### 7.3 Phase 3 Scaling (Weeks 9-12)

**Enterprise Features**:
1. **High Availability**: Multi-region deployment
2. **Advanced Security**: SSO, audit logging, compliance
3. **Performance Optimization**: Caching, query optimization
4. **Analytics**: Usage dashboards, business intelligence
5. **Integration**: Third-party platform integrations

**Success Criteria**:
- 99.9% uptime SLA
- Enterprise security certifications
- Performance benchmarks met
- Integration ecosystem established

### 7.4 Scalability Considerations

**Vertical Scaling**:
- Database: Larger instances, read replicas
- Cache: Redis cluster
- Storage: S3 with CDN

**Horizontal Scaling**:
- API servers: Load balancer with auto-scaling
- Workers: Queue-based, stateless processing
- Search: Elasticsearch cluster

**Cost Optimization**:
- Spot instances for batch processing
- Reserved instances for base load
- Storage tiering (hot/warm/cold)
- CDN for document delivery

## 8. Team Assignment

### 8.1 Backend Engineer (Primary Responsibility)

**Tasks**:
- Core API development (Node.js/Express)
- Database schema design and optimization
- Processing pipeline implementation
- Integration with external services
- Performance tuning and scaling

**Skills Required**:
- Node.js, TypeScript, Express
- PostgreSQL, Prisma/TypeORM
- Redis, Bull queue
- AWS/Cloud services
- API design and security

### 8.2 DevOps Engineer

**Tasks**:
- Infrastructure as Code (Terraform, CloudFormation)
- CI/CD pipeline setup and maintenance
- Monitoring and alerting configuration
- Security and compliance
- Disaster recovery planning

**Skills Required**:
- Kubernetes, Docker
- AWS/GCP/Azure
- Prometheus, Grafana
- Security best practices
- Automation tools

### 8.3 Frontend Engineer (If Needed)

**Tasks**:
- Admin dashboard development
- API documentation portal
- Integration examples and SDKs
- User interface for document management

**Skills Required**:
- React/Next.js, TypeScript
- API integration
- UI/UX design principles
- Documentation tools

### 8.4 QA Engineer

**Tasks**:
- Test automation and CI integration
- Performance and load testing
- Security testing and penetration testing
- User acceptance testing coordination
- Quality metrics and reporting

**Skills Required**:
- Testing frameworks (Jest, Playwright)
- Performance testing tools
- Security testing knowledge
- CI/CD integration

## 9. Risk Assessment

### 9.1 Technical Risks

**High**:
- **OCR Accuracy**: Complex documents may have poor extraction quality
- **AI Model Costs**: GPT-4 API costs could exceed projections
- **Scalability**: Processing pipeline may not scale as expected

**Mitigation**:
- Multiple OCR engines with fallback
- Cost monitoring and optimization
- Load testing early and often

### 9.2 Business Risks

**High**:
- **Market Competition**: Established players in document processing
- **Pricing Strategy**: Finding right price point for value
- **Customer Acquisition**: Attracting first customers

**Mitigation**:
- Focus on specific verticals or use cases
- Flexible pricing tiers
- Partnership and integration strategy

### 9.3 Operational Risks

**Medium**:
- **Data Security**: Handling sensitive documents
- **Compliance**: GDPR, HIPAA, other regulations
- **Support Load**: Customer support requirements

**Mitigation**:
- Security-first architecture
- Compliance framework from day one
- Scalable support processes

## 10. Conclusion

This technical design provides a comprehensive blueprint for implementing a Document Intelligence API service using Node.js/Express. The architecture balances performance, scalability, and development velocity while maintaining enterprise-grade security and reliability.

**Key Advantages**:
1. **Fast Time-to-Market**: Using Node.js/Express with available templates
2. **Scalable Architecture**: Microservices, queues, and cloud-native design
3. **Cost-Effective**: Optimized resource usage with tiered services
4. **Enterprise-Ready**: Security, compliance, and monitoring built-in

**Next Steps**:
1. **Review**: Stakeholder review of this design
2. **Implementation**: Begin Phase 1 development
3. **Testing**: Comprehensive testing plan execution
4. **Deployment**: Staging and production rollout

**Estimated Timeline**:
- **MVP (Phase 1)**: 4 weeks
- **Feature Complete (Phase 2)**: 8 weeks
- **Production Ready (Phase 3)**: 12 weeks

This design enables the delivery of a $15,000-$25,000 service offering with clear technical specifications, development roadmap, and risk mitigation strategies.

---

**Document Version**: 1.0  
**Last Updated**: April 13, 2026  
**Author**: Backend Engineer  
**Status**: Ready for Implementation Review  
**Related Issues**: [PRIA-23](/PRIA/issues/PRIA-23), [PRIA-29](/PRIA/issues/PRIA-29), [PRIA-33](/PRIA/issues/PRIA-33)