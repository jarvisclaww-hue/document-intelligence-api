import AWS from 'aws-sdk';
import { logger } from '../utils/logger';

// S3 configuration
const s3 = new AWS.S3({
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  endpoint: process.env.S3_ENDPOINT || undefined,
  s3ForcePathStyle: process.env.S3_ENDPOINT ? true : false, // Required for S3-compatible services
});

const BUCKET = process.env.S3_BUCKET || 'document-intelligence-dev';

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
  async uploadFile(options: UploadFileOptions): Promise<string> {
    try {
      const params: AWS.S3.PutObjectRequest = {
        Bucket: BUCKET,
        Key: options.key,
        Body: options.buffer,
        ContentType: options.contentType,
        Metadata: options.metadata,
      };

      await s3.putObject(params).promise();

      logger.debug('File uploaded successfully', {
        key: options.key,
        size: options.buffer.length,
        bucket: BUCKET,
      });

      return options.key;
    } catch (error) {
      logger.error('Error uploading file to S3:', error);
      throw new Error(`Failed to upload file: ${(error as Error).message}`);
    }
  }

  async getFile(key: string): Promise<AWS.S3.GetObjectOutput | null> {
    try {
      const params: AWS.S3.GetObjectRequest = {
        Bucket: BUCKET,
        Key: key,
      };

      const data = await s3.getObject(params).promise();

      logger.debug('File retrieved successfully', {
        key,
        size: data.ContentLength,
        bucket: BUCKET,
      });

      return data;
    } catch (error: any) {
      if (error.code === 'NoSuchKey' || error.statusCode === 404) {
        logger.warn('File not found in S3:', { key, bucket: BUCKET });
        return null;
      }

      logger.error('Error retrieving file from S3:', error);
      throw new Error(`Failed to retrieve file: ${error.message}`);
    }
  }

  async deleteFile(key: string): Promise<boolean> {
    try {
      const params: AWS.S3.DeleteObjectRequest = {
        Bucket: BUCKET,
        Key: key,
      };

      await s3.deleteObject(params).promise();

      logger.debug('File deleted successfully', {
        key,
        bucket: BUCKET,
      });

      return true;
    } catch (error: any) {
      logger.error('Error deleting file from S3:', error);
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  async fileExists(key: string): Promise<boolean> {
    try {
      const params: AWS.S3.HeadObjectRequest = {
        Bucket: BUCKET,
        Key: key,
      };

      await s3.headObject(params).promise();
      return true;
    } catch (error: any) {
      if (error.code === 'NotFound' || error.statusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  async copyFile(sourceKey: string, destinationKey: string): Promise<string> {
    try {
      const params: AWS.S3.CopyObjectRequest = {
        Bucket: BUCKET,
        CopySource: `${BUCKET}/${sourceKey}`,
        Key: destinationKey,
      };

      await s3.copyObject(params).promise();

      logger.debug('File copied successfully', {
        sourceKey,
        destinationKey,
        bucket: BUCKET,
      });

      return destinationKey;
    } catch (error: any) {
      logger.error('Error copying file in S3:', error);
      throw new Error(`Failed to copy file: ${error.message}`);
    }
  }

  async listFiles(prefix?: string): Promise<FileInfo[]> {
    try {
      const params: AWS.S3.ListObjectsV2Request = {
        Bucket: BUCKET,
        Prefix: prefix,
      };

      const data = await s3.listObjectsV2(params).promise();

      const files: FileInfo[] = (data.Contents || []).map((item) => ({
        Key: item.Key!,
        Size: item.Size!,
        LastModified: item.LastModified!,
      }));

      logger.debug('Files listed successfully', {
        prefix,
        count: files.length,
        bucket: BUCKET,
      });

      return files;
    } catch (error: any) {
      logger.error('Error listing files in S3:', error);
      throw new Error(`Failed to list files: ${error.message}`);
    }
  }

  async getPresignedUrl(
    key: string,
    expiresInSeconds: number = 3600,
  ): Promise<string> {
    try {
      const params = {
        Bucket: BUCKET,
        Key: key,
        Expires: expiresInSeconds,
      };

      const url = await s3.getSignedUrlPromise('getObject', params);

      logger.debug('Presigned URL generated', {
        key,
        expiresIn: expiresInSeconds,
        bucket: BUCKET,
      });

      return url;
    } catch (error: any) {
      logger.error('Error generating presigned URL:', error);
      throw new Error(`Failed to generate presigned URL: ${error.message}`);
    }
  }

  async getFileMetadata(key: string): Promise<FileInfo | null> {
    try {
      const params: AWS.S3.HeadObjectRequest = {
        Bucket: BUCKET,
        Key: key,
      };

      const data = await s3.headObject(params).promise();

      const fileInfo: FileInfo = {
        Key: key,
        Size: data.ContentLength || 0,
        LastModified: data.LastModified || new Date(),
        ContentType: data.ContentType,
        Metadata: data.Metadata,
      };

      logger.debug('File metadata retrieved', {
        key,
        size: fileInfo.Size,
        bucket: BUCKET,
      });

      return fileInfo;
    } catch (error: any) {
      if (error.code === 'NotFound' || error.statusCode === 404) {
        return null;
      }

      logger.error('Error retrieving file metadata:', error);
      throw new Error(`Failed to retrieve file metadata: ${error.message}`);
    }
  }

  async getBucketSize(): Promise<number> {
    try {
      const params: AWS.S3.ListObjectsV2Request = {
        Bucket: BUCKET,
      };

      let totalSize = 0;
      let continuationToken: string | undefined;

      do {
        if (continuationToken) {
          params.ContinuationToken = continuationToken;
        }

        const data = await s3.listObjectsV2(params).promise();

        totalSize += (data.Contents || []).reduce(
          (sum, item) => sum + (item.Size || 0),
          0,
        );
        continuationToken = data.NextContinuationToken;
      } while (continuationToken);

      logger.debug('Bucket size calculated', {
        bucket: BUCKET,
        totalSize,
      });

      return totalSize;
    } catch (error: any) {
      logger.error('Error calculating bucket size:', error);
      throw new Error(`Failed to calculate bucket size: ${error.message}`);
    }
  }
}

export const storageService = new StorageService();
export default storageService;
