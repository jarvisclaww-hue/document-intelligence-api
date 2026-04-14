import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from './database';
import { logger } from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_change_this_in_production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const API_KEY_SALT = process.env.API_KEY_SALT || 'your_api_key_salt_change_this';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  tenantId?: string;
}

export interface ApiKeyInfo {
  userId: string;
  name: string;
  scopes: string[];
  rateLimitPerDay: number;
}

// Generate API key
export function generateApiKey(
  _userId: string,
  _name: string
): {
  key: string;
  keyHash: string;
  prefix: string;
} {
  const rawKey = crypto.randomBytes(32).toString('hex');
  const prefix = rawKey.substring(0, 8);
  const keyHash = crypto.createHmac('sha256', API_KEY_SALT).update(rawKey).digest('hex');

  return {
    key: `${prefix}.${rawKey.substring(8)}`,
    keyHash,
    prefix,
  };
}

// Verify API key
export async function verifyApiKey(apiKey: string): Promise<ApiKeyInfo | null> {
  try {
    const [prefix, rest] = apiKey.split(".");
    if (!prefix || !rest) {
      return null;
    }

    const rawKey = prefix + rest;
    const keyHash = crypto.createHmac("sha256", API_KEY_SALT).update(rawKey).digest("hex");

    // Look up by keyHash in ApiKey table
    const apiKeyRecord = await db.apiKey.findByKeyHash(keyHash);
    if (apiKeyRecord) {
      return {
        userId: (apiKeyRecord as any).userId,
        name: (apiKeyRecord as any).name,
        scopes: (apiKeyRecord as any).scopes as string[] || ["documents:read", "documents:write"],
        rateLimitPerDay: (apiKeyRecord as any).rateLimitPerDay || 10000,
      };
    }

    // Fallback: check User.apiKey field (for keys set during registration)
    const userRecord = await db.user.findByApiKey(keyHash);
    if (userRecord) {
      return {
        userId: userRecord.id,
        name: "Default API Key",
        scopes: ["documents:read", "documents:write"],
        rateLimitPerDay: 10000,
      };
    }

    return null;
  } catch (error) {
    logger.error("Error verifying API key:", error);
    return null;
  }
}

// Generate JWT token
export function generateToken(user: AuthUser): string {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
  };

  const options: jwt.SignOptions = {
    expiresIn: JWT_EXPIRES_IN as any,
  };

  return jwt.sign(payload, JWT_SECRET as jwt.Secret, options);
}

// Verify JWT token
export function verifyToken(token: string): AuthUser | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    return decoded;
  } catch (error) {
    logger.error('Error verifying token:', error);
    return null;
  }
}

// Hash password
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
}

// Verify password
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return await bcrypt.compare(password, hashedPassword);
}

// Extract token from Authorization header
export function extractToken(authorizationHeader?: string): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const parts = authorizationHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

// Extract API key from header
export function extractApiKey(apiKeyHeader?: string): string | null {
  if (!apiKeyHeader) {
    return null;
  }
  return apiKeyHeader;
}

// Authentication middleware factory
export function authenticate() {
  return async (req: any, res: any, next: any) => {
    try {
      // Try JWT token first
      const token = extractToken(req.headers.authorization);
      if (token) {
        const user = verifyToken(token);
        if (user) {
          req.user = user;
          return next();
        }
      }

      // Try API key
      const apiKey = extractApiKey(req.headers['x-api-key']);
      if (apiKey) {
        const apiKeyInfo = await verifyApiKey(apiKey);
        if (apiKeyInfo) {
          // Get user details from database
          const user = await db.user.findById(apiKeyInfo.userId);
          if (user) {
            req.user = {
              id: user.id,
              email: user.email,
              role: user.role,
            };
            req.apiKeyInfo = apiKeyInfo;
            return next();
          }
        }
      }

      // No valid authentication found
      res.status(401).json({
        error: {
          code: 'authentication_error',
          message: 'Invalid or missing authentication credentials',
          request_id: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Authentication error:', error);
      res.status(500).json({
        error: {
          code: 'internal_error',
          message: 'Internal server error during authentication',
          request_id: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    }
  };
}

// Authorization middleware factory
export function authorize(roles: string[] = []) {
  return (req: any, res: any, next: any) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'authentication_error',
          message: 'Authentication required',
          request_id: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    }

    if (roles.length > 0 && !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: {
          code: 'authorization_error',
          message: 'Insufficient permissions',
          request_id: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    }

    next();
  };
}

// Scopes middleware factory
export function requireScopes(scopes: string[] = []) {
  return (req: any, res: any, next: any) => {
    if (!req.apiKeyInfo && !req.user) {
      return res.status(401).json({
        error: {
          code: 'authentication_error',
          message: 'API key required for scope-based authorization',
          request_id: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // For JWT users, assume all scopes (admin users)
    if (req.user) {
      return next();
    }

    // Check API key scopes
    if (req.apiKeyInfo) {
      const hasAllScopes = scopes.every(scope => req.apiKeyInfo.scopes.includes(scope));

      if (!hasAllScopes) {
        return res.status(403).json({
          error: {
            code: 'authorization_error',
            message: `Required scopes: ${scopes.join(', ')}`,
            request_id: req.id,
            timestamp: new Date().toISOString(),
          },
        });
      }
    }

    next();
  };
}
