import { RateLimiterRedis } from 'rate-limiter-flexible';
import Redis from 'redis';
import type { Request, Response, NextFunction } from 'express';
import { RateLimitError } from './error-handler';
import { logger } from '../utils/logger';

// Create Redis client
const redisClient = Redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  password: process.env.REDIS_PASSWORD,
});

redisClient.on('error', error => {
  logger.error('Redis connection error:', error);
});

// Rate limiter configuration
const globalRateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rate_limit',
  points: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  duration: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10) / 1000, // Convert to seconds
  blockDuration: 60, // Block for 60 seconds after limit is reached
});

// Tier-based rate limits (requests per day)
const TIER_LIMITS = {
  free: 100,
  basic: 10000,
  pro: 100000,
  enterprise: 1000000,
};

// Endpoint-specific limits (requests per 15 minutes)
const ENDPOINT_LIMITS = {
  'POST /documents': 10, // Upload is more expensive
  'GET /documents': 100,
  'GET /documents/:id': 100,
  'GET /search': 50, // Search is more expensive
  'POST /search/advanced': 20,
  'POST /auth/token': 10,
  'POST /webhooks': 5,
};

export async function rateLimiterMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    // Skip rate limiting for health checks
    if (req.path === '/health') {
      return next();
    }

    // Get user identifier (API key or user ID)
    let identifier = 'anonymous';

    if (req.headers['x-api-key']) {
      identifier = `api_key:${req.headers['x-api-key']}`;
    } else if (req.user?.id) {
      identifier = `user:${req.user.id}`;
    } else {
      // Use IP address as fallback
      identifier = `ip:${req.ip || req.socket.remoteAddress}`;
    }

    // Create rate limit key
    const endpointKey = `${req.method} ${req.path.split('/').slice(0, 3).join('/')}`;
    const limitKey = `${identifier}:${endpointKey}`;

    // Get endpoint-specific limit or use default
    const points = (ENDPOINT_LIMITS as any)[endpointKey] || 100;

    // Apply rate limiting
    await globalRateLimiter.consume(limitKey, points);

    // Set rate limit headers
    const rateLimiterRes = await globalRateLimiter.get(limitKey);
    if (rateLimiterRes) {
      res.setHeader('X-RateLimit-Limit', points);
      res.setHeader('X-RateLimit-Remaining', rateLimiterRes.remainingPoints);
      res.setHeader('X-RateLimit-Reset', Math.ceil(rateLimiterRes.msBeforeNext / 1000));
    }

    next();
  } catch (error: any) {
    if (error.remainingPoints === 0) {
      // Rate limit exceeded
      const retryAfter = Math.ceil(error.msBeforeNext / 1000);
      res.setHeader('Retry-After', retryAfter);

      next(new RateLimitError(`Rate limit exceeded. Try again in ${retryAfter} seconds.`));
    } else {
      // Redis or other error
      logger.error('Rate limiter error:', error);
      // Allow request to proceed if rate limiting fails
      next();
    }
  }
}

// Tier-based rate limiter for API keys
export function createTierRateLimiter(tier: keyof typeof TIER_LIMITS) {
  const pointsPerDay = TIER_LIMITS[tier];
  const pointsPer15Min = Math.ceil(pointsPerDay / 96); // Divide by 96 (24h * 4 periods per hour)

  return new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: `tier_limit:${tier}`,
    points: pointsPer15Min,
    duration: 900, // 15 minutes in seconds
    blockDuration: 3600, // Block for 1 hour
  });
}

// Export the main rate limiter middleware
export const rateLimiter = rateLimiterMiddleware;
