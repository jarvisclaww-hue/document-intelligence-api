import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  generateToken,
  verifyToken,
  hashPassword,
  verifyPassword,
  generateApiKey,
} from '../../services/auth';
import { db } from '../../services/database';
import { ValidationError, AuthenticationError } from '../../middleware/error-handler';

// Validation schemas
const getTokenSchema = z.object({
  api_key: z.string().optional(),
  email: z.string().email().optional(),
  password: z.string().optional(),
  grant_type: z.enum(['api_key', 'password']).default('api_key'),
});

const refreshTokenSchema = z.object({
  refresh_token: z.string(),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()).optional(),
  expires_in_days: z.number().int().positive().max(365).optional(),
});

export const authController = {
  // Get authentication token
  async getToken(req: Request, res: Response, next: NextFunction) {
    try {
      const body = getTokenSchema.parse(req.body);

      let user: any = null;
      let tokenType = 'bearer';

      if (body.grant_type === 'api_key' && body.api_key) {
        // API key authentication
        // In a real implementation, you would look up the API key in the database
        // For now, we'll use a simple mock
        user = await db.user.findByApiKey(body.api_key);
        if (!user) {
          throw new AuthenticationError('Invalid API key');
        }

        tokenType = 'api_key';
      } else if (body.grant_type === 'password' && body.email && body.password) {
        // Email/password authentication
        user = await db.user.findByEmail(body.email);
        if (!user || !user.hashedPassword) {
          throw new AuthenticationError('Invalid credentials');
        }

        const isValidPassword = await verifyPassword(body.password, user.hashedPassword);
        if (!isValidPassword) {
          throw new AuthenticationError('Invalid credentials');
        }

        // Update last login
        await db.user.updateLastLogin(user.id);
      } else {
        throw new ValidationError('Invalid authentication method');
      }

      // Check user status
      if (user.status !== 'ACTIVE') {
        throw new AuthenticationError('Account is not active');
      }

      // Generate tokens
      const accessToken = generateToken({
        id: user.id,
        email: user.email,
        role: user.role,
      });

      // In a real implementation, you would generate a refresh token
      const refreshToken = generateToken({
        id: user.id,
        email: user.email,
        role: user.role,
      });

      // Log the authentication
      await (db as any).auditLog.create({
        userId: user.id,
        action: 'auth.login',
        details: {
          grant_type: body.grant_type,
          token_type: tokenType,
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.json({
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: tokenType,
        expires_in: 3600, // 1 hour
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Refresh token
  async refreshToken(req: Request, res: Response, next: NextFunction) {
    try {
      const body = refreshTokenSchema.parse(req.body);

      // Verify refresh token
      const user = verifyToken(body.refresh_token);
      if (!user) {
        throw new AuthenticationError('Invalid refresh token');
      }

      // Generate new access token
      const accessToken = generateToken(user);
      const newRefreshToken = generateToken(user);

      res.json({
        access_token: accessToken,
        refresh_token: newRefreshToken,
        token_type: 'bearer',
        expires_in: 3600,
      });
    } catch (error) {
      next(error);
    }
  },

  // Register new user (for demonstration purposes)
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const body = registerSchema.parse(req.body);

      // Check if user already exists
      const existingUser = await db.user.findByEmail(body.email);
      if (existingUser) {
        throw new ValidationError('User with this email already exists');
      }

      // Hash password
      const hashedPassword = await hashPassword(body.password);

      // Create user
      const user = await db.user.create({
        email: body.email,
        hashedPassword,
        role: 'USER',
        metadata: {
          name: body.name,
          registered_at: new Date().toISOString(),
        },
      });

      // Generate API key for the user
      const apiKey = generateApiKey(user.id, 'Default API Key');

      // In a real implementation, you would save the API key to the database
      // For now, we'll just return it

      // Generate tokens
      const accessToken = generateToken({
        id: user.id,
        email: user.email,
        role: user.role,
      });

      // Log the registration
      await db.auditLog.create({
        userId: user.id,
        action: 'auth.register',
        details: {
          has_api_key: true,
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.status(201).json({
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          created_at: user.createdAt,
        },
        access_token: accessToken,
        token_type: 'bearer',
        expires_in: 3600,
        api_key: apiKey.key, // In production, this should only be shown once
        message: 'API key will only be shown once. Save it securely.',
      });
    } catch (error) {
      next(error);
    }
  },

  // Create API key
  async createApiKey(req: Request, res: Response, next: NextFunction) {
    try {
      const body = createApiKeySchema.parse(req.body);
      const { user } = req as any;

      // Generate API key
      const apiKey = generateApiKey(user.id, body.name);

      // In a real implementation, you would save the API key to the database
      // with the specified scopes and expiration

      // Calculate expiration date
      const expiresAt = body.expires_in_days
        ? new Date(Date.now() + body.expires_in_days * 24 * 60 * 60 * 1000)
        : undefined;

      // Log the API key creation
      await db.auditLog.create({
        userId: user.id,
        action: 'api_key.create',
        details: {
          name: body.name,
          scopes: body.scopes || ['documents:read', 'documents:write'],
          expires_at: expiresAt?.toISOString(),
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.status(201).json({
        api_key: apiKey.key,
        name: body.name,
        prefix: apiKey.prefix,
        scopes: body.scopes || ['documents:read', 'documents:write'],
        expires_at: expiresAt?.toISOString(),
        created_at: new Date().toISOString(),
        message: 'API key will only be shown once. Save it securely.',
      });
    } catch (error) {
      next(error);
    }
  },

  // Get user profile
  async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const { user } = req as any;

      // Get user from database
      const userData = await db.user.findById(user.id);
      if (!userData) {
        throw new AuthenticationError('User not found');
      }

      // Get user statistics
      const documentStats = await db.document.aggregate({
        where: { userId: user.id },
        _count: { id: true },
        _sum: { fileSizeBytes: true },
      });

      res.json({
        user: {
          id: userData.id,
          email: userData.email,
          role: userData.role,
          status: userData.status,
          created_at: userData.createdAt,
          last_login_at: userData.lastLoginAt,
          metadata: userData.metadata,
        },
        stats: {
          total_documents: documentStats._count.id || 0,
          total_size_bytes: documentStats._sum.fileSizeBytes || 0,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Update user profile
  async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const { user } = req as any;
      const { name, metadata } = req.body;

      // Update user metadata
      const currentMetadata = (user.metadata as any) || {};
      const updatedMetadata = {
        ...currentMetadata,
        ...metadata,
        name: name || currentMetadata.name,
        updated_at: new Date().toISOString(),
      };

      await db.user.update({
        where: { id: user.id },
        data: { metadata: updatedMetadata },
      });

      // Log the update
      await db.auditLog.create({
        userId: user.id,
        action: 'user.update_profile',
        details: {
          updated_fields: Object.keys(req.body),
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.json({
        message: 'Profile updated successfully',
        user: {
          id: user.id,
          email: user.email,
          metadata: updatedMetadata,
        },
      });
    } catch (error) {
      next(error);
    }
  },
};
