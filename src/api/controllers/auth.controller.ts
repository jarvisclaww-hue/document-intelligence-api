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
import { ValidationError, AuthenticationError, NotFoundError } from '../../middleware/error-handler';

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
        user = await db.user.findByApiKey(body.api_key);
        if (!user) {
          throw new AuthenticationError('Invalid API key');
        }
        tokenType = 'api_key';
      } else if (body.grant_type === 'password' && body.email && body.password) {
        user = await db.user.findByEmail(body.email);
        if (!user || !user.hashedPassword) {
          throw new AuthenticationError('Invalid credentials');
        }

        const isValidPassword = await verifyPassword(body.password, user.hashedPassword);
        if (!isValidPassword) {
          throw new AuthenticationError('Invalid credentials');
        }

        await db.user.updateLastLogin(user.id);
      } else {
        throw new ValidationError('Invalid authentication method');
      }

      if (user.status !== 'ACTIVE') {
        throw new AuthenticationError('Account is not active');
      }

      const accessToken = generateToken({
        id: user.id,
        email: user.email,
        role: user.role,
      });

      const refreshToken = generateToken({
        id: user.id,
        email: user.email,
        role: user.role,
      });

      await db.auditLog.create({
        userId: user.id,
        action: 'auth.login',
        details: { grant_type: body.grant_type, token_type: tokenType },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.json({
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: tokenType,
        expires_in: 3600,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          metadata: user.metadata,
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
      const user = verifyToken(body.refresh_token);
      if (!user) {
        throw new AuthenticationError('Invalid refresh token');
      }

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

  // Register
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const body = registerSchema.parse(req.body);

      const existingUser = await db.user.findByEmail(body.email);
      if (existingUser) {
        throw new ValidationError('User with this email already exists');
      }

      const hashedPw = await hashPassword(body.password);

      const user = await db.user.create({
        email: body.email,
        hashedPassword: hashedPw,
        role: 'USER',
        metadata: {
          name: body.name,
          registered_at: new Date().toISOString(),
        },
      });

      // Generate and PERSIST API key
      const apiKeyData = generateApiKey(user.id, 'Default API Key');
      await db.apiKey.create({
        userId: user.id,
        name: 'Default API Key',
        key: apiKeyData.keyHash,
        scopes: ['documents:read', 'documents:write'],
      });

      // Also store the key hash on the user record for quick lookups
      await db.user.update({
        where: { id: user.id },
        data: { apiKey: apiKeyData.keyHash },
      });

      const accessToken = generateToken({
        id: user.id,
        email: user.email,
        role: user.role,
      });

      await db.auditLog.create({
        userId: user.id,
        action: 'auth.register',
        details: { has_api_key: true },
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
        api_key: apiKeyData.key,
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

      const apiKeyData = generateApiKey(user.id, body.name);

      const expiresAt = body.expires_in_days
        ? new Date(Date.now() + body.expires_in_days * 24 * 60 * 60 * 1000)
        : undefined;

      // Persist the API key to the database
      await db.apiKey.create({
        userId: user.id,
        name: body.name,
        key: apiKeyData.keyHash,
        scopes: body.scopes || ['documents:read', 'documents:write'],
        expiresAt,
      });

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
        api_key: apiKeyData.key,
        name: body.name,
        prefix: apiKeyData.prefix,
        scopes: body.scopes || ['documents:read', 'documents:write'],
        expires_at: expiresAt?.toISOString(),
        created_at: new Date().toISOString(),
        message: 'API key will only be shown once. Save it securely.',
      });
    } catch (error) {
      next(error);
    }
  },

  // List API keys
  async listApiKeys(req: Request, res: Response, next: NextFunction) {
    try {
      const { user } = req as any;

      const keys = await db.apiKey.findMany({
        where: { userId: user.id, revokedAt: null },
        select: {
          id: true,
          name: true,
          prefix: true,
          scopes: true,
          rateLimitPerDay: true,
          lastUsedAt: true,
          expiresAt: true,
          createdAt: true,
        },
      });

      res.json({ api_keys: keys });
    } catch (error) {
      next(error);
    }
  },

  // Revoke API key
  async revokeApiKey(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { user } = req as any;

      // Verify the key belongs to this user
      const key = await db.apiKey.findById(id);
      if (!key || (key as any).userId !== user.id) {
        throw new NotFoundError('API key');
      }

      await db.apiKey.revoke(id);

      await db.auditLog.create({
        userId: user.id,
        action: 'api_key.revoke',
        details: { key_id: id },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.json({ message: 'API key revoked', id });
    } catch (error) {
      next(error);
    }
  },

  // Get profile
  async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const { user } = req as any;

      const userData = await db.user.findById(user.id);
      if (!userData) {
        throw new AuthenticationError('User not found');
      }

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
          total_documents: ((documentStats as any)?._count || {}).id || 0,
          total_size_bytes: ((documentStats as any)?._sum || {}).fileSizeBytes || 0,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Update profile
  async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const { user } = req as any;
      const { name, metadata } = req.body;

      const currentUser = await db.user.findById(user.id);
      const currentMetadata = ((currentUser as any)?.metadata as any) || {};
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

      await db.auditLog.create({
        userId: user.id,
        action: 'user.update_profile',
        details: { updated_fields: Object.keys(req.body) },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.json({
        message: 'Profile updated successfully',
        user: { id: user.id, email: user.email, metadata: updatedMetadata },
      });
    } catch (error) {
      next(error);
    }
  },

  // Change password
  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { user } = req as any;
      const { current_password, new_password } = req.body;

      if (!current_password || !new_password || new_password.length < 8) {
        throw new ValidationError('Current password and new password (8+ chars) are required.');
      }

      const userData = await db.user.findById(user.id);
      if (!userData || !userData.hashedPassword) {
        throw new AuthenticationError('User not found');
      }

      const isValid = await verifyPassword(current_password, userData.hashedPassword);
      if (!isValid) {
        throw new AuthenticationError('Current password is incorrect');
      }

      const newHash = await hashPassword(new_password);
      await db.user.update({
        where: { id: user.id },
        data: { hashedPassword: newHash },
      });

      await db.auditLog.create({
        userId: user.id,
        action: 'user.change_password',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      next(error);
    }
  },
};
