import { Router } from 'express';
import multer from 'multer';
import { documentController } from '../controllers/document.controller';
import { authController } from '../controllers/auth.controller';
import { authenticate, authorize, requireScopes } from '../../services/auth';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
});

// Auth routes
router.post('/auth/token', authController.getToken);
router.post('/auth/refresh', authController.refreshToken);
router.post('/auth/register', authController.register);
router.post('/auth/api-keys', authenticate(), authController.createApiKey);

// Document routes
router.post(
  '/documents',
  authenticate(),
  requireScopes(['documents:write']),
  upload.single('file'),
  documentController.upload
);

router.get(
  '/documents',
  authenticate(),
  requireScopes(['documents:read']),
  documentController.list
);

router.get(
  '/documents/:id',
  authenticate(),
  requireScopes(['documents:read']),
  documentController.getStatus
);

router.get(
  '/documents/:id/download',
  authenticate(),
  requireScopes(['documents:read']),
  documentController.download
);

router.patch(
  '/documents/:id',
  authenticate(),
  requireScopes(['documents:write']),
  documentController.update
);

router.delete(
  '/documents/:id',
  authenticate(),
  requireScopes(['documents:write']),
  documentController.delete
);

// Search routes
router.get('/search', authenticate(), requireScopes(['documents:read']), documentController.search);

// Stats routes
router.get(
  '/stats/documents',
  authenticate(),
  requireScopes(['documents:read']),
  documentController.getStats
);

// Health check
router.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'document-intelligence-api',
    version: process.env.npm_package_version || '1.0.0',
  });
});

// Admin routes (protected by admin role)
const adminRouter = Router();
adminRouter.use(authenticate(), authorize(['ADMIN']));

// Queue management
adminRouter.get('/queues/stats', async (_req, res, next) => {
  try {
    const { queueService } = await import('../../services/queue');
    const stats = await queueService.getQueueStats();
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/queues/clean', async (req, res, next) => {
  try {
    const { queueService } = await import('../../services/queue');
    const { ageInHours } = req.body;
    const cleaned = await queueService.cleanOldJobs(ageInHours || 24);
    res.json({ cleaned, ageInHours: ageInHours || 24 });
  } catch (error) {
    next(error);
  }
});

// System info
adminRouter.get('/system/info', async (_req, res, next) => {
  try {
    const { db } = await import('../../services/database');
    const { storageService } = await import('../../services/storage');

    const [dbConnected, bucketSize] = await Promise.all([
      db.checkDatabaseConnection(),
      storageService.getBucketSize().catch(() => 0),
    ]);

    res.json({
      database: {
        connected: dbConnected,
        timestamp: new Date().toISOString(),
      },
      storage: {
        bucket: process.env.S3_BUCKET,
        totalSizeBytes: bucketSize,
      },
      redis: {
        connected: true, // Would need actual check
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        memory: process.memoryUsage(),
        uptime: process.uptime(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// Mount admin routes
router.use('/admin', adminRouter);

export const apiRouter = router;
