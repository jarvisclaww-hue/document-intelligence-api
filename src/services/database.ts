import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient({
  log: [
    { level: 'warn', emit: 'event' },
    { level: 'error', emit: 'event' },
    { level: 'info', emit: 'event' },
    { level: 'query', emit: 'event' },
  ],
});

// Log Prisma events
prisma.$on('warn', (e: any) => {
  logger.warn('Prisma Warning:', e);
});

prisma.$on('error', (e: any) => {
  logger.error('Prisma Error:', e);
});

prisma.$on('info', (e: any) => {
  logger.info('Prisma Info:', e);
});

prisma.$on('query', (e: any) => {
  logger.debug('Prisma Query:', {
    query: e.query,
    params: e.params,
    duration: e.duration,
  });
});

// Connection health check
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info('Database connection established successfully');
    return true;
  } catch (error) {
    logger.error('Database connection failed:', error);
    return false;
  }
}

// Graceful shutdown
export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    logger.info('Database connection closed');
  } catch (error) {
    logger.error('Error disconnecting from database:', error);
  }
}

// Transaction helper
export async function withTransaction<T>(
  callback: (prisma: PrismaClient) => Promise<T>
): Promise<T> {
  return await prisma.$transaction(callback);
}

// Database utilities
export const db = {
  // Check database connection
  checkDatabaseConnection,

  // User operations
  user: {
    async findById(id: string) {
      return await prisma.user.findUnique({ where: { id } });
    },

    async findByEmail(email: string) {
      return await prisma.user.findUnique({ where: { email } });
    },

    async findByApiKey(apiKey: string) {
      return await prisma.user.findUnique({ where: { apiKey } });
    },

    async create(data: { email: string; hashedPassword?: string; role?: string; metadata?: any }) {
      return await prisma.user.create({
        data: {
          email: data.email,
          hashedPassword: data.hashedPassword,
          role: data.role as any,
          metadata: data.metadata || {},
        },
      });
    },

    async update(data: { where: { id: string }; data: any }) {
      return await prisma.user.update(data);
    },

    async updateLastLogin(userId: string) {
      return await prisma.user.update({
        where: { id: userId },
        data: { lastLoginAt: new Date() },
      });
    },
  },

  // Tenant operations
  tenant: {
    async findById(id: string) {
      return await prisma.tenant.findUnique({ where: { id } });
    },

    async findByApiKey(apiKey: string) {
      return await prisma.tenant.findUnique({ where: { apiKey } });
    },

    async create(data: { name: string; metadata?: any }) {
      return await prisma.tenant.create({
        data: {
          name: data.name,
          metadata: data.metadata || {},
        },
      });
    },
  },

  // API key operations
  apiKey: {
    async findByKey(key: string) {
      return await prisma.apiKey.findUnique({ where: { key } });
    },

    async create(data: {
      userId: string;
      name: string;
      key: string;
      scopes: string[];
      expiresAt?: Date;
    }) {
      return await prisma.apiKey.create({
        data: {
          userId: data.userId,
          name: data.name,
          key: data.key,
          scopes: data.scopes,
          expiresAt: data.expiresAt,
        },
      });
    },

    async revoke(id: string) {
      return await prisma.apiKey.update({
        where: { id },
        data: { revokedAt: new Date() },
      });
    },
  },

  // Document operations
  document: {
    async count(where?: any) {
      return await prisma.document.count({ where });
    },

    async findMany(options?: any) {
      return await prisma.document.findMany(options);
    },

    async aggregate(options: any) {
      return await prisma.document.aggregate(options);
    },

    async update(options: any) {
      return await prisma.document.update(options);
    },

    async delete(options: any) {
      return await prisma.document.delete(options);
    },

    async create(data: {
      tenantId: string;
      userId: string;
      originalFilename: string;
      fileSizeBytes: number;
      fileType: string;
      storageKey: string;
      metadata?: any;
    }) {
      return await prisma.document.create({
        data: {
          tenantId: data.tenantId,
          userId: data.userId,
          originalFilename: data.originalFilename,
          fileSizeBytes: data.fileSizeBytes,
          fileType: data.fileType,
          storageKey: data.storageKey,
          metadata: data.metadata || {},
        },
      });
    },

    async findById(id: string, tenantId?: string) {
      const where: any = { id };
      if (tenantId) {
        where.tenantId = tenantId;
      }
      return await prisma.document.findUnique({ where });
    },

    async updateStatus(id: string, status: string, progress?: number, errorMessage?: string) {
      const data: any = { status };
      if (progress !== undefined) data.progress = progress;
      if (errorMessage) data.errorMessage = errorMessage;

      if (status === 'PROCESSING') {
        data.processingStartedAt = new Date();
      } else if (status === 'COMPLETED' || status === 'FAILED') {
        data.processingCompletedAt = new Date();
      }

      return await prisma.document.update({
        where: { id },
        data,
      });
    },

    async updateResults(id: string, data: any) {
      const { text, summary, entities, categories, confidence } = data;

      return await prisma.document.update({
        where: { id },
        data: {
          processedText: text,
          summary,
          entities,
          categories,
          confidence,
        },
      });
    },

    async listByTenant(tenantId: string, options?: any) {
      const {
        status,
        limit = 50,
        offset = 0,
        sortBy = 'createdAt',
        order = 'desc',
      } = options || {};

      const where: any = { tenantId };
      if (status) where.status = status;

      const [documents, total] = await Promise.all([
        prisma.document.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: { [sortBy]: order },
        }),
        prisma.document.count({ where }),
      ]);

      return { documents, total };
    },
  },

  // Processing job operations
  processingJob: {
    async findById(id: string) {
      return await prisma.processingJob.findUnique({ where: { id } });
    },

    async findMany(options?: any) {
      return await prisma.processingJob.findMany(options);
    },

    async updateStatus(id: string, status: string, outputData?: any, errorMessage?: string) {
      const data: any = { status };
      if (outputData) data.outputData = outputData;
      if (errorMessage) data.errorMessage = errorMessage;

      if (status === 'RUNNING') {
        data.startedAt = new Date();
        data.attempts = { increment: 1 };
      } else if (status === 'COMPLETED' || status === 'FAILED') {
        data.completedAt = new Date();
      }

      return await prisma.processingJob.update({
        where: { id },
        data,
      });
    },

    async create(data: {
      documentId: string;
      jobType: string;
      priority?: number;
      inputData?: any;
    }) {
      return await prisma.processingJob.create({
        data: {
          documentId: data.documentId,
          jobType: data.jobType,
          priority: data.priority || 0,
          inputData: data.inputData || {},
        },
      });
    },

    async findPendingJobs(limit = 10) {
      return await prisma.processingJob.findMany({
        where: {
          status: 'PENDING',
          scheduledAt: { lte: new Date() },
        },
        take: limit,
        orderBy: [{ priority: 'desc' }, { scheduledAt: 'asc' }],
      });
    },
  },

  // Webhook operations
  webhook: {
    async findByTenant(tenantId: string) {
      return await prisma.webhook.findMany({
        where: { tenantId, enabled: true },
      });
    },

    async create(data: {
      tenantId: string;
      url: string;
      events: string[];
      secret?: string;
      metadata?: any;
    }) {
      return await prisma.webhook.create({
        data: {
          tenantId: data.tenantId,
          url: data.url,
          events: data.events,
          secret: data.secret,
          metadata: data.metadata || {},
        },
      });
    },
  },

  // Audit log operations
  auditLog: {
    async create(data: {
      tenantId?: string;
      userId?: string;
      action: string;
      resourceType?: string;
      resourceId?: string;
      details?: any;
      ipAddress?: string;
      userAgent?: string;
    }) {
      return await prisma.auditLog.create({
        data: {
          tenantId: data.tenantId,
          userId: data.userId,
          action: data.action,
          resourceType: data.resourceType,
          resourceId: data.resourceId,
          details: data.details || {},
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
        },
      });
    },
  },
};

export { prisma };
export default prisma;
