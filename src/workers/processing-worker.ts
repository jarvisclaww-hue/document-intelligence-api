import 'dotenv/config';
import Queue from 'bull';
import { createWorker } from 'tesseract.js';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import * as cheerio from 'cheerio';

import compromise from 'compromise';
import { logger } from '../utils/logger';
import { db } from '../services/database';
import { storageService } from '../services/storage';
import { queueService } from '../services/queue';

// Initialize NLP tools

interface ProcessingJobData {
  documentId: string;
  storageKey: string;
  userId: string;
  processingOptions?: {
    ocr_engine?: 'tesseract' | 'pdfjs' | 'auto';
    language_hint?: string;
    extract_tables?: boolean;
    extract_images?: boolean;
    ai_models?: string[];
  };
}

class ProcessingWorker {
  private documentQueue: Queue.Queue<ProcessingJobData>;

  constructor() {
    this.documentQueue = new Queue(
      'document-processing',
      process.env.REDIS_URL || 'redis://localhost:6379',
      {
        redis: {
          password: process.env.REDIS_PASSWORD,
        },
      }
    );

    this.setupWorker();
  }

  private setupWorker() {
    // Process document jobs
    this.documentQueue.process('document-processing', 5, async job => {
      try {
        const { documentId, storageKey, processingOptions } = job.data;

        logger.info('Starting document processing', {
          jobId: job.id,
          documentId,
          storageKey,
        });

        // Update document status
        await db.document.updateStatus(documentId, 'PROCESSING', 10);

        // Get file from storage
        const file = await storageService.getFile(storageKey);
        if (!file) {
          throw new Error('File not found: ' + storageKey);
        }

        // Detect file type and process
        const buffer = file;
        const fileType = this.detectFileType(storageKey, undefined);

        let extractedText = '';
        const processingStats: any = {};

        switch (fileType) {
          case 'pdf':
            extractedText = await this.processPDF(buffer, processingOptions);
            processingStats.pdfProcessing = { engine: 'pdf-parse' };
            break;

          case 'docx':
            extractedText = await this.processDOCX(buffer);
            processingStats.docxProcessing = { engine: 'mammoth' };
            break;

          case 'image':
            extractedText = await this.processImage(buffer, processingOptions);
            processingStats.ocrProcessing = {
              engine: processingOptions?.ocr_engine || 'tesseract',
              language: processingOptions?.language_hint || 'eng',
            };
            break;

          case 'text':
            extractedText = buffer.toString('utf-8');
            processingStats.textProcessing = { encoding: 'utf-8' };
            break;

          case 'html':
            extractedText = await this.processHTML(buffer);
            processingStats.htmlProcessing = { engine: 'cheerio' };
            break;

          default:
            throw new Error(`Unsupported file type: ${fileType}`);
        }

        // Clean and normalize text
        const cleanedText = this.cleanText(extractedText);

        // Update document with extracted text
        await db.document.update({
          where: { id: documentId },
          data: {
            extractedText: cleanedText,
            progress: 50,
            processingStats: {
              ...processingStats,
              textLength: cleanedText.length,
              wordCount: this.countWords(cleanedText),
              processingTimeMs: Date.now() - job.timestamp,
            },
          },
        });

        // Basic NLP analysis (entity extraction)
        const entities = await this.extractEntities(cleanedText);
        const summary = this.generateSummary(cleanedText);

        // Update document with NLP results
        await db.document.updateResults(documentId, {
          extractedText: cleanedText,
          entities,
          summary,
          processingStats: {
            ...processingStats,
            entityCount: entities.length,
            summaryLength: summary.length,
            totalProcessingTimeMs: Date.now() - job.timestamp,
          },
        });

        // Queue AI analysis if requested
        if (processingOptions?.ai_models && processingOptions.ai_models.length > 0) {
          await queueService.addAIAnalysisJob({
            documentId,
            text: cleanedText,
            analysisType: 'summary', // Default analysis type
            options: { models: processingOptions.ai_models },
          });
        }

        logger.info('Document processing completed', {
          jobId: job.id,
          documentId,
          textLength: cleanedText.length,
          entityCount: entities.length,
          processingTime: Date.now() - job.timestamp,
        });

        return {
          success: true,
          documentId,
          textLength: cleanedText.length,
          entityCount: entities.length,
        };
      } catch (error) {
        logger.error('Document processing failed', {
          jobId: job.id,
          documentId: job.data.documentId,
          error: (error as Error).message,
          stack: (error as Error).stack,
        });

        // Update document status to failed
        await db.document.updateStatus(
          job.data.documentId,
          'FAILED',
          undefined,
          (error as Error).message
        );

        throw error;
      }
    });

    // Handle queue events
    this.documentQueue.on('completed', (job, result) => {
      logger.info('Processing job completed successfully', {
        jobId: job.id,
        documentId: job.data.documentId,
        result,
      });
    });

    this.documentQueue.on('failed', (job, error) => {
      logger.error('Processing job failed', {
        jobId: job?.id,
        documentId: job?.data.documentId,
        error: error.message,
        attempts: job?.attemptsMade,
      });
    });

    this.documentQueue.on('stalled', job => {
      logger.warn('Processing job stalled', {
        jobId: job.id,
        documentId: job.data.documentId,
      });
    });

    logger.info('Processing worker started and listening for jobs');
  }

  private detectFileType(filename: string, contentType?: string): string {
    const extension = filename.toLowerCase().split('.').pop() || '';

    // Check by extension first
    if (['pdf'].includes(extension)) {
      return 'pdf';
    }
    if (['docx', 'doc'].includes(extension)) {
      return 'docx';
    }
    if (['jpg', 'jpeg', 'png', 'tiff', 'tif', 'bmp', 'gif'].includes(extension)) {
      return 'image';
    }
    if (['txt', 'md', 'rtf'].includes(extension)) {
      return 'text';
    }
    if (['html', 'htm'].includes(extension)) {
      return 'html';
    }

    // Fall back to content type
    if (contentType) {
      if (contentType.includes('pdf')) {
        return 'pdf';
      }
      if (contentType.includes('word') || contentType.includes('document')) {
        return 'docx';
      }
      if (contentType.includes('image')) {
        return 'image';
      }
      if (contentType.includes('text')) {
        return 'text';
      }
      if (contentType.includes('html')) {
        return 'html';
      }
    }

    return 'unknown';
  }

  private async processPDF(buffer: Buffer, _options?: any): Promise<string> {
    try {
      const data = await pdfParse(buffer);
      return data.text;
    } catch (error) {
      logger.warn('PDF parsing failed, falling back to OCR', {
        error: (error as Error).message,
      });

      // Fall back to OCR for scanned PDFs
      try {
        const worker = await createWorker('eng' as any);
        const {
          data: { text },
        } = await worker.recognize(buffer);
        await worker.terminate();
        return text;
      } catch (ocrError) {
        throw new Error(`PDF processing failed: ${(error as Error).message}`);
      }
    }
  }

  private async processDOCX(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      throw new Error(`DOCX processing failed: ${(error as Error).message}`);
    }
  }

  private async processImage(buffer: Buffer, _options?: any): Promise<string> {
    try {
      const language = _options?.language_hint || 'eng';
      const worker = await createWorker(language as any);

      const {
        data: { text },
      } = await worker.recognize(buffer);
      await worker.terminate();

      return text;
    } catch (error) {
      throw new Error(`Image OCR failed: ${(error as Error).message}`);
    }
  }

  private async processHTML(buffer: Buffer): Promise<string> {
    try {
      const html = buffer.toString('utf-8');
      const $ = cheerio.load(html);

      // Remove script and style tags
      $('script, style').remove();

      // Get text from body
      const text = $('body').text();

      // Clean up whitespace
      return text.replace(/\s+/g, ' ').trim();
    } catch (error) {
      throw new Error(`HTML processing failed: ${(error as Error).message}`);
    }
  }

  private cleanText(text: string): string {
    // Remove extra whitespace
    let cleaned = text.replace(/\s+/g, ' ').trim();

    // Remove control characters
    cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, '');

    // Normalize line endings
    cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Remove duplicate paragraphs
    const paragraphs = cleaned.split('\n\n');
    const uniqueParagraphs = [...new Set(paragraphs.map(p => p.trim()))];
    cleaned = uniqueParagraphs.join('\n\n');

    return cleaned;
  }

  private countWords(text: string): number {
    const words = text.match(/\b\w+\b/g);
    return words ? words.length : 0;
  }

  private async extractEntities(text: string): Promise<any[]> {
    const entities: any[] = [];

    try {
      // Use compromise for basic entity extraction
      const doc = compromise(text);

      // Extract people
      const people = doc.people().json();
      people.forEach((person: any) => {
        entities.push({
          type: 'PERSON',
          value: person.text,
          confidence: 0.8,
          start_offset: person.offset.start,
          end_offset: person.offset.end,
        });
      });

      // Extract organizations
      const organizations = doc.organizations().json();
      organizations.forEach((org: any) => {
        entities.push({
          type: 'ORGANIZATION',
          value: org.text,
          confidence: 0.7,
          start_offset: org.offset.start,
          end_offset: org.offset.end,
        });
      });

      // Extract dates
      const dates = (doc as any).dates().json();
      dates.forEach((date: any) => {
        entities.push({
          type: 'DATE',
          value: date.text,
          confidence: 0.9,
          start_offset: date.offset.start,
          end_offset: date.offset.end,
        });
      });

      // Extract money amounts
      const money = doc.money().json();
      money.forEach((amount: any) => {
        entities.push({
          type: 'MONEY',
          value: amount.text,
          confidence: 0.85,
          start_offset: amount.offset.start,
          end_offset: amount.offset.end,
        });
      });

      // Extract locations
      const places = doc.places().json();
      places.forEach((place: any) => {
        entities.push({
          type: 'LOCATION',
          value: place.text,
          confidence: 0.75,
          start_offset: place.offset.start,
          end_offset: place.offset.end,
        });
      });
    } catch (error) {
      logger.warn('Entity extraction failed', {
        error: (error as Error).message,
      });
    }

    return entities;
  }

  private generateSummary(text: string, maxSentences: number = 3): string {
    try {
      // Simple summarization: take first few sentences
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [];

      if (sentences.length === 0) {
        return text.substring(0, 200) + (text.length > 200 ? '...' : '');
      }

      const summarySentences = sentences.slice(0, maxSentences);
      return summarySentences.join(' ').trim();
    } catch (error) {
      logger.warn('Summary generation failed', {
        error: (error as Error).message,
      });
      return text.substring(0, 200) + (text.length > 200 ? '...' : '');
    }
  }

  // Start the worker
  public start() {
    logger.info('Processing worker started successfully');
  }

  // Graceful shutdown
  public async shutdown() {
    try {
      await this.documentQueue.close();
      logger.info('Processing worker shutdown completed');
    } catch (error) {
      logger.error('Error during worker shutdown:', error);
    }
  }
}

// Start worker if this file is run directly
if (require.main === module) {
  const worker = new ProcessingWorker();
  worker.start();

  // Handle shutdown signals
  const gracefulShutdown = async () => {
    logger.info('Received shutdown signal, stopping worker...');
    await worker.shutdown();
    process.exit(0);
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
}

export default ProcessingWorker;
