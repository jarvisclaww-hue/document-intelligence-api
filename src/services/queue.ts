import Queue from 'bull';
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

export interface WebhookJobData {
  event: string;
  payload: any;
  url: string;
  secretToken?: string;
}

class QueueService {
  private documentQueue: Queue.Queue<DocumentProcessingJobData>;
  private aiQueue: Queue.Queue<AIAnalysisJobData>;
  private webhookQueue: Queue.Queue<WebhookJobData>;

  constructor() {
    // Document processing queue
    this.documentQueue = new Queue(
      'document-processing',
      process.env.REDIS_URL || 'redis://localhost:6379',
      {
        redis: {
          password: process.env.REDIS_PASSWORD,
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        },
      }
    );

    // AI analysis queue
    this.aiQueue = new Queue('ai-analysis', process.env.REDIS_URL || 'redis://localhost:6379', {
      redis: {
        password: process.env.REDIS_PASSWORD,
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    });

    // Webhook delivery queue
    this.webhookQueue = new Queue(
      'webhook-delivery',
      process.env.REDIS_URL || 'redis://localhost:6379',
      {
        redis: {
          password: process.env.REDIS_PASSWORD,
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        },
      }
    );

    this.setupEventListeners();
  }

  private setupEventListeners() {
    // Document queue events
    this.documentQueue.on('completed', (job, _result) => {
      logger.info('Document processing job completed', {
        jobId: job.id,
        documentId: job.data.documentId,
      });
    });

    this.documentQueue.on('failed', (job, error) => {
      logger.error('Document processing job failed', {
        jobId: job?.id,
        documentId: job?.data.documentId,
        error: error.message,
        attempts: job?.attemptsMade,
      });
    });

    this.documentQueue.on('stalled', job => {
      logger.warn('Document processing job stalled', {
        jobId: job.id,
        documentId: job.data.documentId,
      });
    });

    // AI queue events
    this.aiQueue.on('completed', (job, _result) => {
      logger.info('AI analysis job completed', {
        jobId: job.id,
        documentId: job.data.documentId,
        analysisType: job.data.analysisType,
      });
    });

    this.aiQueue.on('failed', (job, error) => {
      logger.error('AI analysis job failed', {
        jobId: job?.id,
        documentId: job?.data.documentId,
        error: error.message,
      });
    });

    // Webhook queue events
    this.webhookQueue.on('completed', job => {
      logger.info('Webhook delivered successfully', {
        jobId: job.id,
        url: job.data.url,
        event: job.data.event,
      });
    });

    this.webhookQueue.on('failed', (job, error) => {
      logger.error('Webhook delivery failed', {
        jobId: job?.id,
        url: job?.data.url,
        event: job?.data.event,
        error: error.message,
        attempts: job?.attemptsMade,
      });
    });
  }

  // Add document processing job
  async addDocumentProcessingJob(data: DocumentProcessingJobData): Promise<Queue.Job> {
    const job = await this.documentQueue.add(data);
    logger.info('Document processing job added', {
      jobId: job.id,
      documentId: data.documentId,
    });
    return job;
  }

  // Add AI analysis job
  async addAIAnalysisJob(data: AIAnalysisJobData): Promise<Queue.Job> {
    const job = await this.aiQueue.add(data);
    logger.info('AI analysis job added', {
      jobId: job.id,
      documentId: data.documentId,
      analysisType: data.analysisType,
    });
    return job;
  }

  // Add webhook job
  async addWebhookJob(data: WebhookJobData): Promise<Queue.Job> {
    const job = await this.webhookQueue.add(data);
    logger.info('Webhook job added', {
      jobId: job.id,
      url: data.url,
      event: data.event,
    });
    return job;
  }

  // Get job by ID
  async getJob(queueName: 'document' | 'ai' | 'webhook', jobId: string): Promise<Queue.Job | null> {
    const queue = this.getQueue(queueName);
    return await queue.getJob(jobId);
  }

  // Get queue statistics
  async getQueueStats() {
    const [documentStats, aiStats, webhookStats] = await Promise.all([
      this.documentQueue.getJobCounts(),
      this.aiQueue.getJobCounts(),
      this.webhookQueue.getJobCounts(),
    ]);

    return {
      documentQueue: documentStats,
      aiQueue: aiStats,
      webhookQueue: webhookStats,
      timestamp: new Date().toISOString(),
    };
  }

  // Clean old jobs
  async cleanOldJobs(ageInHours: number): Promise<number> {
    const cutoffDate = new Date(Date.now() - ageInHours * 60 * 60 * 1000);
    let cleanedCount = 0;

    // Clean completed jobs
    await this.documentQueue.clean(1000, 'completed', cutoffDate.getTime());
    await this.aiQueue.clean(1000, 'completed', cutoffDate.getTime());
    await this.webhookQueue.clean(1000, 'completed', cutoffDate.getTime());

    // Clean failed jobs (keep fewer)
    const failedCutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days
    await this.documentQueue.clean(1000, 'failed', failedCutoffDate.getTime());
    await this.aiQueue.clean(1000, 'failed', failedCutoffDate.getTime());
    await this.webhookQueue.clean(1000, 'failed', failedCutoffDate.getTime());

    return cleanedCount;
  }

  // Remove job
  async removeJob(queueName: 'document' | 'ai' | 'webhook', jobId: string) {
    const job = await this.getJob(queueName, jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found in queue ${queueName}`);
    }

    await job.remove();
    logger.info('Job removed', { queueName, jobId });
  }

  // Get queue instance
  private getQueue(queueName: 'document' | 'ai' | 'webhook'): Queue.Queue<any> {
    switch (queueName) {
      case 'document':
        return this.documentQueue;
      case 'ai':
        return this.aiQueue;
      case 'webhook':
        return this.webhookQueue;
      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }
  }

  // Process queues
  async processDocumentQueue(
    processor: (job: Queue.Job<DocumentProcessingJobData>) => Promise<any>
  ) {
    this.documentQueue.process(async job => {
      return await processor(job);
    });
  }

  async processAIQueue(processor: (job: Queue.Job<AIAnalysisJobData>) => Promise<any>) {
    this.aiQueue.process(async job => {
      return await processor(job);
    });
  }

  async processWebhookQueue(processor: (job: Queue.Job<WebhookJobData>) => Promise<any>) {
    this.webhookQueue.process(async job => {
      return await processor(job);
    });
  }
}

export const queueService = new QueueService();
export default queueService;
