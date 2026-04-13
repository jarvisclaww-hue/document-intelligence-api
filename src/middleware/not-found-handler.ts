import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export function notFoundHandler(req: Request, res: Response, _next: NextFunction) {
  logger.warn('Route not found:', {
    requestId: req.id,
    path: req.path,
    method: req.method,
    query: req.query,
    params: req.params,
  });

  res.status(404).json({
    error: {
      code: 'not_found',
      message: `Route ${req.method} ${req.path} not found`,
      request_id: req.id,
      timestamp: new Date().toISOString(),
    },
  });
}
