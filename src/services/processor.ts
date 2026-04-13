import { createWorker } from 'tesseract.js';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import * as cheerio from 'cheerio';
import compromise from 'compromise';

import { logger } from '../utils/logger';
import { db } from './database';
import { storageService } from './storage';

/**
 * Inline document processor — replaces the Bull/Redis worker.
 * Call processDocument() after upload; it runs async and updates the DB directly.
 */
export async function processDocument(
  documentId: string,
  storageKey: string,
  processingOptions?: {
    ocr_engine?: 'tesseract' | 'pdfjs' | 'auto';
    language_hint?: string;
    extract_entities?: boolean;
    generate_summary?: boolean;
  }
): Promise<void> {
  const startTime = Date.now();

  try {
    await db.document.updateStatus(documentId, 'PROCESSING', 10);

    // Get file from storage
    const buffer = await storageService.getFile(storageKey);
    if (!buffer) {
      throw new Error('File not found: ' + storageKey);
    }

    // Detect file type and extract text
    const fileType = detectFileType(storageKey);
    let extractedText = '';
    const processingStats: Record<string, unknown> = {};

    switch (fileType) {
      case 'pdf':
        extractedText = await processPDF(buffer);
        processingStats.engine = 'pdf-parse';
        break;
      case 'docx':
        extractedText = await processDOCX(buffer);
        processingStats.engine = 'mammoth';
        break;
      case 'image':
        extractedText = await processImage(buffer, processingOptions?.language_hint);
        processingStats.engine = 'tesseract.js';
        break;
      case 'text':
        extractedText = buffer.toString('utf-8');
        processingStats.engine = 'utf-8';
        break;
      case 'html':
        extractedText = processHTML(buffer);
        processingStats.engine = 'cheerio';
        break;
      default:
        throw new Error(`Unsupported file type: ${fileType}`);
    }

    const cleanedText = cleanText(extractedText);

    // Update progress
    await db.document.update({
      where: { id: documentId },
      data: { progress: 50 },
    });

    // Entity extraction
    const entities = extractEntities(cleanedText);
    const summary = generateSummary(cleanedText);

    const elapsed = Date.now() - startTime;

    // Save results
    await db.document.update({
      where: { id: documentId },
      data: {
        extractedText: cleanedText,
        entities,
        summary,
        status: 'COMPLETED',
        progress: 100,
        processingStats: {
          ...processingStats,
          textLength: cleanedText.length,
          wordCount: countWords(cleanedText),
          entityCount: entities.length,
          processingTimeMs: elapsed,
        },
        processingCompletedAt: new Date(),
      },
    });

    // Update the processing job record too
    try {
      const jobs = await db.processingJob.findMany({
        where: { documentId },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
      if (jobs.length > 0) {
        await db.processingJob.updateStatus(jobs[0].id, 'COMPLETED', {
          textLength: cleanedText.length,
          entityCount: entities.length,
        });
      }
    } catch {
      // non-critical
    }

    logger.info('Document processed', { documentId, textLength: cleanedText.length, entityCount: entities.length, elapsed });
  } catch (error) {
    logger.error('Document processing failed', { documentId, error: (error as Error).message });
    await db.document.updateStatus(documentId, 'FAILED', undefined, (error as Error).message);

    try {
      const jobs = await db.processingJob.findMany({
        where: { documentId },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
      if (jobs.length > 0) {
        await db.processingJob.updateStatus(jobs[0].id, 'FAILED', undefined, (error as Error).message);
      }
    } catch {
      // non-critical
    }
  }
}

// ── helpers ──────────────────────────────────────────────────────────────

function detectFileType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() || '';
  if (ext === 'pdf') return 'pdf';
  if (['docx', 'doc'].includes(ext)) return 'docx';
  if (['jpg', 'jpeg', 'png', 'tiff', 'tif', 'bmp', 'gif'].includes(ext)) return 'image';
  if (['txt', 'md', 'rtf'].includes(ext)) return 'text';
  if (['html', 'htm'].includes(ext)) return 'html';
  return 'unknown';
}

async function processPDF(buffer: Buffer): Promise<string> {
  try {
    const data = await pdfParse(buffer);
    return data.text;
  } catch (err) {
    logger.warn('pdf-parse failed, falling back to OCR');
    const worker = await createWorker('eng' as any);
    const { data: { text } } = await worker.recognize(buffer);
    await worker.terminate();
    return text;
  }
}

async function processDOCX(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function processImage(buffer: Buffer, lang?: string): Promise<string> {
  const worker = await createWorker((lang || 'eng') as any);
  const { data: { text } } = await worker.recognize(buffer);
  await worker.terminate();
  return text;
}

function processHTML(buffer: Buffer): string {
  const $ = cheerio.load(buffer.toString('utf-8'));
  $('script, style').remove();
  return $('body').text().replace(/\s+/g, ' ').trim();
}

function cleanText(text: string): string {
  let t = text.replace(/\s+/g, ' ').trim();
  t = t.replace(/[\x00-\x1F\x7F]/g, '');
  t = t.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const paras = t.split('\n\n');
  return [...new Set(paras.map(p => p.trim()))].join('\n\n');
}

function countWords(text: string): number {
  return (text.match(/\b\w+\b/g) || []).length;
}

function extractEntities(text: string): any[] {
  const entities: any[] = [];
  try {
    const doc = compromise(text);

    for (const p of doc.people().json()) {
      entities.push({ type: 'PERSON', value: p.text, confidence: 0.8 });
    }
    for (const o of doc.organizations().json()) {
      entities.push({ type: 'ORGANIZATION', value: o.text, confidence: 0.7 });
    }
    for (const d of (doc as any).dates().json()) {
      entities.push({ type: 'DATE', value: d.text, confidence: 0.9 });
    }
    for (const m of doc.money().json()) {
      entities.push({ type: 'MONEY', value: m.text, confidence: 0.85 });
    }
    for (const l of doc.places().json()) {
      entities.push({ type: 'LOCATION', value: l.text, confidence: 0.75 });
    }
  } catch (err) {
    logger.warn('Entity extraction failed', { error: (err as Error).message });
  }
  return entities;
}

function generateSummary(text: string, maxSentences = 3): string {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  if (sentences.length === 0) return text.substring(0, 200) + (text.length > 200 ? '...' : '');
  return sentences.slice(0, maxSentences).join(' ').trim();
}
