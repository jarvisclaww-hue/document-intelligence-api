import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// Simple in-memory rate limiter (no Redis required)
const requestCounts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10);

export async function rateLimiterMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.path === '/health') return next();

    const identifier = (req.headers['x-api-key'] as string) || 
                       (req as any).user?.id || 
                       req.ip || 'anonymous';
    
    const now = Date.now();
    const entry = requestCounts.get(identifier);
    
    if (!entry || now > entry.resetAt) {
      requestCounts.set(identifier, { count: 1, resetAt: now + WINDOW_MS });
      res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
      res.setHeader('X-RateLimit-Remaining', MAX_REQUESTS - 1);
      return next();
    }
    
    entry.count++;
    const remaining = Math.max(0, MAX_REQUESTS - entry.count);
    res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
    res.setHeader('X-RateLimit-Remaining', remaining);
    
    if (entry.count > MAX_REQUESTS) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      res.status(429).json({ error: `Rate limit exceeded. Try again in ${retryAfter} seconds.` });
      return;
    }
    
    next();
  } catch (error) {
    logger.error('Rate limiter error:', error);
    next();
  }
}

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of requestCounts) {
    if (now > entry.resetAt) requestCounts.delete(key);
  }
}, 5 * 60 * 1000);

export const rateLimiter = rateLimiterMiddleware;
