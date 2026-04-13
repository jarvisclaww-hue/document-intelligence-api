import { logger } from '../utils/logger';

export interface DocumentProcessingJobData {
  documentId: string;
  storageKey: string;
  userId: string;
  processingOptions?: {
    ocr_engine?: 'tesseract' | 'pdfjs' | 'auto';
    language_hint?: string;
    extract_entities?: boolean;
    generate_summary?: boolean;
  };
}

export interface AIAnalysisJobData {
  documentId: string;
  text: string;
  analysisType: 'summary' | 'entities' | 'classification' | 'qa';
  options?: any;
}

// In-memory job queue (no Redis dependency)
class QueueService {
  private jobs: Map<string, any> = new Map();

  async addDocumentProcessingJob(data: DocumentProcessingJobData) {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    this.jobs.set(jobId, { id: jobId, data, status: 'queued', createdAt: new Date() });
    logger.info({ jobId, documentId: data.documentId }, 'Document processing job queued (in-memory)');
    return { id: jobId };
  }

  async addAIAnalysisJob(data: AIAnalysisJobData) {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    this.jobs.set(jobId, { id: jobId, data, status: 'queued', createdAt: new Date() });
    logger.info({ jobId, documentId: data.documentId }, 'AI analysis job queued (in-memory)');
    return { id: jobId };
  }

  async getQueueStats() {
    return {
      documentProcessing: { waiting: 0, active: 0, completed: this.jobs.size, failed: 0 },
      aiAnalysis: { waiting: 0, active: 0, completed: 0, failed: 0 },
    };
  }

  async cleanOldJobs(_ageInHours: number) {
    const count = this.jobs.size;
    this.jobs.clear();
    return count;
  }
}

export const queueService = new QueueService();
