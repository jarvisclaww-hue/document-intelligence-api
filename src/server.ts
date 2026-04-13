import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { pinoHttp } from 'pino-http';

import { logger } from './utils/logger';
import { errorHandler } from './middleware/error-handler';
import { notFoundHandler } from './middleware/not-found-handler';
import { rateLimiter } from './middleware/rate-limiter';
import { apiRouter } from './api/routes';
import { swaggerDocs } from './utils/swagger';

export async function createServer(): Promise<Application> {
  const app = express();

  // Security middleware
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
    })
  );

  // CORS configuration
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    })
  );

  // Compression
  app.use(compression());

  // Request logging (simplified for compatibility)
  app.use(pinoHttp({ quietReqLogger: true }));

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
    });
  });

  // Rate limiting for API routes
  app.use('/api', rateLimiter);

  // API routes
  app.use('/api/v1', apiRouter);

  // Swagger documentation
  if (true) { // Swagger enabled for all environments
    swaggerDocs(app, Number(process.env.PORT) || 3000);
  }

  // 404 handler
  app.use(notFoundHandler);

  // Error handler
  app.use(errorHandler);

  return app;
}
