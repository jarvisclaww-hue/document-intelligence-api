import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(400, 'validation_error', message, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(401, 'authentication_error', message);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(403, 'authorization_error', message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(404, 'not_found', `${resource} not found`);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded') {
    super(429, 'rate_limit_exceeded', message);
  }
}

export class ProcessingError extends AppError {
  constructor(message: string = 'Document processing failed') {
    super(500, 'processing_error', message);
  }
}

export function errorHandler(error: Error, req: Request, res: Response, _next: NextFunction) {
  // Log the error
  logger.error('Error:', {
    error: error.message,
    stack: error.stack,
    requestId: req.id,
    path: req.path,
    method: req.method,
  });

  // Handle AppError instances
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        request_id: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Handle Zod validation errors
  if (error.name === 'ZodError') {
    return res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'Validation failed',
        details: error.message,
        request_id: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Handle Prisma errors
  if (error.name === 'PrismaClientKnownRequestError') {
    // Handle unique constraint violations
    if ((error as any).code === 'P2002') {
      return res.status(409).json({
        error: {
          code: 'conflict',
          message: 'Resource already exists',
          details: `Unique constraint violation on ${(error as any).meta?.target}`,
          request_id: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Handle not found errors
    if ((error as any).code === 'P2025') {
      return res.status(404).json({
        error: {
          code: 'not_found',
          message: 'Resource not found',
          details: error.message,
          request_id: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  // Handle JWT errors
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: {
        code: 'authentication_error',
        message: 'Invalid token',
        request_id: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  }

  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: {
        code: 'authentication_error',
        message: 'Token expired',
        request_id: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Default error response
  const statusCode = (error as any).statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  return res.status(statusCode).json({
    error: {
      code: 'internal_error',
      message: isProduction ? 'Internal server error' : error.message,
      ...(isProduction ? {} : { stack: error.stack }),
      request_id: req.id,
      timestamp: new Date().toISOString(),
    },
  });
}
