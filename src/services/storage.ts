import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

const STORAGE_DIR = process.env.LOCAL_STORAGE_DIR || '/tmp/pria-doc-storage';

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

export interface UploadFileOptions {
  key: string;
  buffer: Buffer;
  contentType: string;
  metadata?: Record<string, string>;
}

export interface FileInfo {
  Key: string;
  Size: number;
  LastModified: Date;
  ContentType?: string;
  Metadata?: Record<string, string>;
}

class StorageService {
  async uploadFile(options: UploadFileOptions): Promise<{ key: string; url: string }> {
    const filePath = path.join(STORAGE_DIR, options.key);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, options.buffer);
    logger.info('File uploaded to local storage: ' + options.key);
    return { key: options.key, url: `/storage/${options.key}` };
  }

  async getFile(key: string): Promise<Buffer> {
    const filePath = path.join(STORAGE_DIR, key);
    return fs.readFileSync(filePath);
  }

  async deleteFile(key: string): Promise<void> {
    const filePath = path.join(STORAGE_DIR, key);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  async getFileInfo(key: string): Promise<FileInfo> {
    const filePath = path.join(STORAGE_DIR, key);
    const stats = fs.statSync(filePath);
    return { Key: key, Size: stats.size, LastModified: stats.mtime };
  }

  async getBucketSize(): Promise<number> {
    let total = 0;
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        const s = fs.statSync(p);
        if (s.isDirectory()) walk(p); else total += s.size;
      }
    };
    walk(STORAGE_DIR);
    return total;
  }

  async getSignedUrl(key: string): Promise<string> {
    return `/storage/${key}`;
  }
}

export const storageService = new StorageService();
