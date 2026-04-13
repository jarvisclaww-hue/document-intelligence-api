import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../../services/database';
import { queueService } from '../../services/queue';
import { storageService } from '../../services/storage';
import { ValidationError, NotFoundError } from '../../middleware/error-handler';
import { logger } from '../../utils/logger';

// Validation schemas
const uploadDocumentSchema = z.object({
  metadata: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      tags: z.array(z.string()).optional(),
      language: z.string().optional(),
      document_type: z.string().optional(),
      custom_fields: z.record(z.any()).optional(),
    })
    .optional(),
  callback_url: z.string().url().optional(),
  processing_options: z
    .object({
      ocr_engine: z.enum(['tesseract', 'pdfjs', 'auto']).optional(),
      language_hint: z.string().optional(),
      extract_tables: z.boolean().optional(),
      extract_images: z.boolean().optional(),
      ai_models: z.array(z.string()).optional(),
    })
    .optional(),
});

const searchDocumentsSchema = z.object({
  q: z.string().optional(),
  field: z.enum(['content', 'metadata', 'entities']).optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
  page: z.number().int().positive().optional(),
  size: z.number().int().positive().max(100).optional(),
  status: z.string().optional(),
});

const updateDocumentSchema = z.object({
  metadata: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
});

// Controller methods
export const documentController = {
  // Upload document
  async upload(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        throw new ValidationError('No file provided');
      }

      // Validate request body
      const body = uploadDocumentSchema.parse(req.body);

      const { user } = req as any;
      const file = req.file;

      // Check user quota (simplified)
      const documentCount = await db.document.count({
        where: { userId: user.id },
      });

      // For MVP, limit to 100 documents per user
      if (documentCount >= 100) {
        throw new ValidationError('Document quota exceeded. Maximum 100 documents per user.');
      }

      // Check file size (max 100MB)
      const maxSize = 100 * 1024 * 1024; // 100MB
      if (file.size > maxSize) {
        throw new ValidationError(`File size exceeds maximum of ${maxSize / (1024 * 1024)}MB`);
      }

      // Validate file type
      const allowedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/png',
        'image/tiff',
        'text/plain',
        'text/html',
      ];

      if (!allowedTypes.includes(file.mimetype)) {
        throw new ValidationError(
          `Unsupported file type: ${file.mimetype}. Supported types: PDF, DOCX, JPEG, PNG, TIFF, TXT, HTML`
        );
      }

      // Generate storage key
      const timestamp = Date.now();
      const storageKey = `documents/${user.id}/${timestamp}_${file.originalname}`;

      // Upload to storage
      await storageService.uploadFile({
        key: storageKey,
        buffer: file.buffer,
        contentType: file.mimetype,
        metadata: {
          originalFilename: file.originalname,
          userId: user.id,
          uploadTimestamp: timestamp.toString(),
        },
      });

      // Create document record
      const document = await db.document.create({
        tenantId: user.tenantId || 'default',
        userId: user.id,
        originalFilename: file.originalname,
        fileSizeBytes: file.size,
        fileType: file.mimetype,
        storageKey,
        metadata: body.metadata || {},
      });

      // Create processing job
      await db.processingJob.create({
        documentId: document.id,
        jobType: 'OCR',
        priority: 1, // Interactive priority
        inputData: {
          storageKey,
          processingOptions: body.processing_options,
          metadata: body.metadata,
        },
      });

      // Queue processing job
      await queueService.addDocumentProcessingJob({
        documentId: document.id,
        storageKey,
        userId: user.id,
        processingOptions: body.processing_options,
      });

      // Log the upload
      await db.auditLog.create({
        userId: user.id,
        tenantId: user.tenantId,
        action: 'document.upload',
        resourceType: 'document',
        resourceId: document.id,
        details: {
          filename: file.originalname,
          fileSize: file.size,
          fileType: file.mimetype,
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      // Set webhook if provided
      if (body.callback_url) {
        // In a real implementation, you would create a webhook record
        logger.info('Webhook URL provided:', body.callback_url);
      }

      res.status(202).json({
        document_id: document.id,
        status: 'queued',
        estimated_completion_time: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes estimate
        webhook_id: body.callback_url ? 'wh_' + document.id.substring(0, 8) : undefined,
      });
    } catch (error) {
      next(error);
    }
  },

  // Get document status
  async getStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { user } = req as any;

      const document = await db.document.findById(id, user.tenantId);
      if (!document) {
        throw new NotFoundError('Document');
      }

      // Check permission
      if (document.userId !== user.id && user.role !== 'ADMIN') {
        throw new NotFoundError('Document');
      }

      // Get processing jobs
      const processingJobs = await db.processingJob.findMany({
        where: { documentId: id },
        orderBy: { createdAt: 'desc' },
      });

      const response = {
        document_id: document.id,
        status: document.status.toLowerCase(),
        progress: document.progress,
        result:
          document.status === 'COMPLETED'
            ? {
                extracted_text: document.extractedText,
                entities: document.entities,
                summary: document.summary,
                metadata: document.metadata,
                processing_time_ms: (document.processingStats as any)?.processingTimeMs,
              }
            : undefined,
        error_message: document.errorMessage,
        processing_jobs: processingJobs.map((job: any) => ({
          job_type: job.jobType,
          status: job.status,
          attempts: job.attempts,
          created_at: job.createdAt.toISOString(),
          started_at: job.startedAt?.toISOString(),
          completed_at: job.completedAt?.toISOString(),
        })),
        created_at: document.createdAt.toISOString(),
        updated_at: document.updatedAt.toISOString(),
        completed_at: document.processingCompletedAt?.toISOString(),
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  },

  // List documents
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { user } = req as any;
      const { status, limit = 50, offset = 0, sort = 'created_at', order = 'desc' } = req.query;

      // Convert query params
      const sortMap: Record<string, string> = {
        created_at: 'createdAt',
        updated_at: 'updatedAt',
        file_size: 'fileSizeBytes',
      };

      const orderMap: Record<string, 'asc' | 'desc'> = {
        asc: 'asc',
        desc: 'desc',
      };

      const result = await db.document.listByTenant(user.tenantId || 'default', {
        status: status as string,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
        sortBy: sortMap[sort as string] || 'createdAt',
        order: orderMap[order as string] || 'desc',
      });

      const documents = result.documents.map((doc: any) => ({
        document_id: doc.id,
        original_filename: doc.originalFilename,
        file_size_bytes: doc.fileSizeBytes,
        file_type: doc.fileType,
        status: doc.status.toLowerCase(),
        progress: doc.progress,
        created_at: doc.createdAt.toISOString(),
        updated_at: doc.updatedAt.toISOString(),
        user: {
          id: doc.user.id,
          email: doc.user.email,
        },
      }));

      res.json({
        documents,
        total: result.total,
        limit,
        offset,
      });
    } catch (error) {
      next(error);
    }
  },

  // Search documents
  async search(req: Request, res: Response, next: NextFunction) {
    try {
      const query = searchDocumentsSchema.parse(req.query);
      const { user } = req as any;

      // For MVP, use simple database search
      // In production, this would use Elasticsearch
      const where: any = {
        tenantId: user.tenantId || 'default',
        userId: user.id, // Users can only search their own documents
      };

      if (query.status) {
        where.status = query.status.toUpperCase();
      }

      if (query.date_from) {
        where.createdAt = { gte: new Date(query.date_from) };
      }

      if (query.date_to) {
        where.createdAt = { lte: new Date(query.date_to) };
      }

      const page = query.page || 1;
      const size = query.size || 20;
      const skip = (page - 1) * size;

      const [documents, total] = await Promise.all([
        db.document.findMany({
          where,
          skip,
          take: size,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            originalFilename: true,
            fileSizeBytes: true,
            fileType: true,
            status: true,
            progress: true,
            summary: true,
            metadata: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        db.document.count({ where }),
      ]);

      // Simple text search if query provided
      let results = documents;
      if (query.q) {
        const searchTerm = query.q.toLowerCase();
        results = documents.filter((doc: any) => {
          // Search in extracted text
          if (doc.extractedText && doc.extractedText.toLowerCase().includes(searchTerm)) {
            return true;
          }
          // Search in summary
          if (doc.summary && doc.summary.toLowerCase().includes(searchTerm)) {
            return true;
          }
          // Search in metadata title/description
          const metadata = doc.metadata as any;
          if (metadata?.title && metadata.title.toLowerCase().includes(searchTerm)) {
            return true;
          }
          if (metadata?.description && metadata.description.toLowerCase().includes(searchTerm)) {
            return true;
          }
          return false;
        });
      }

      const formattedResults = results.map((doc: any) => ({
        document_id: doc.id,
        original_filename: doc.originalFilename,
        file_size_bytes: doc.fileSizeBytes,
        file_type: doc.fileType,
        status: doc.status.toLowerCase(),
        progress: doc.progress,
        summary: doc.summary,
        metadata: doc.metadata,
        created_at: doc.createdAt.toISOString(),
        updated_at: doc.updatedAt.toISOString(),
      }));

      res.json({
        results: formattedResults,
        total,
        page,
        size,
        took_ms: 0, // Would be actual search time in production
      });
    } catch (error) {
      next(error);
    }
  },

  // Update document metadata
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { user } = req as any;
      const body = updateDocumentSchema.parse(req.body);

      const document = await db.document.findById(id, user.tenantId);
      if (!document) {
        throw new NotFoundError('Document');
      }

      // Check permission
      if (document.userId !== user.id && user.role !== 'ADMIN') {
        throw new NotFoundError('Document');
      }

      // Update metadata
      const currentMetadata = (document.metadata as any) || {};
      const updatedMetadata = {
        ...currentMetadata,
        ...body.metadata,
        updated_at: new Date().toISOString(),
      };

      await db.document.update({
        where: { id },
        data: { metadata: updatedMetadata },
      });

      // Log the update
      await db.auditLog.create({
        userId: user.id,
        tenantId: user.tenantId,
        action: 'document.update',
        resourceType: 'document',
        resourceId: document.id,
        details: {
          updated_fields: Object.keys(body.metadata || {}),
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.json({
        document_id: document.id,
        status: 'updated',
        metadata: updatedMetadata,
        updated_at: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  },

  // Delete document
  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { user } = req as any;

      const document = await db.document.findById(id, user.tenantId);
      if (!document) {
        throw new NotFoundError('Document');
      }

      // Check permission
      if (document.userId !== user.id && user.role !== 'ADMIN') {
        throw new NotFoundError('Document');
      }

      // Delete from storage
      await storageService.deleteFile(document.storageKey);

      // Delete from database (cascade will delete processing jobs)
      await db.document.delete({ where: { id } });

      // Log the deletion
      await db.auditLog.create({
        userId: user.id,
        tenantId: user.tenantId,
        action: 'document.delete',
        resourceType: 'document',
        resourceId: document.id,
        details: {
          filename: document.originalFilename,
          fileSize: document.fileSizeBytes,
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.json({
        document_id: document.id,
        status: 'deleted',
        deleted_at: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  },

  // Download document
  async download(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { user } = req as any;

      const document = await db.document.findById(id, user.tenantId);
      if (!document) {
        throw new NotFoundError('Document');
      }

      // Check permission
      if (document.userId !== user.id && user.role !== 'ADMIN') {
        throw new NotFoundError('Document');
      }

      // Get file from storage
      const file = await storageService.getFile(document.storageKey);
      if (!file) {
        throw new NotFoundError('File');
      }

      // Log the download
      await db.auditLog.create({
        userId: user.id,
        tenantId: user.tenantId,
        action: 'document.download',
        resourceType: 'document',
        resourceId: document.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      // Set headers for download
      res.setHeader('Content-Type', document.fileType);
      res.setHeader('Content-Length', file.length || document.fileSizeBytes);
      res.setHeader('Content-Disposition', `attachment; filename="${document.originalFilename}"`);

      // Send file
      res.send(file);
    } catch (error) {
      next(error);
    }
  },

  // Get document statistics
  async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const { user } = req as any;

      const stats = await db.document.aggregate({
        where: {
          tenantId: user.tenantId || 'default',
          userId: user.id,
        },
        _count: {
          id: true,
        },
        _sum: {
          fileSizeBytes: true,
        },
        _avg: {
          progress: true,
        },
        _groupBy: {
          status: true,
        },
      });

      // Format response
      const statusCounts: Record<string, number> = {};
      if (Array.isArray(stats)) {
        stats.forEach((stat: any) => {
          statusCounts[stat.status.toLowerCase()] = stat._count.id;
        });
      }

      res.json({
        total_documents: (stats as any)._count?.id || 0,
        total_size_bytes: (stats as any)._sum?.fileSizeBytes || 0,
        average_progress: (stats as any)._avg?.progress || 0,
        status_counts: statusCounts,
        user_id: user.id,
        tenant_id: user.tenantId,
      });
    } catch (error) {
      next(error);
    }
  },
};
