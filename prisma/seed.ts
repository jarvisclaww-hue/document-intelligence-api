import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create demo tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      name: 'Demo Organisation',
      slug: 'demo',
      plan: 'FREE',
      settings: { description: 'Demo tenant for testing the API' },
    },
  });
  console.log('Tenant:', tenant.id);

  // Create demo user
  const apiKey = `pk_demo_${crypto.randomBytes(16).toString('hex')}`;
  const user = await prisma.user.upsert({
    where: { email: 'demo@pria.dev' },
    update: {},
    create: {
      email: 'demo@pria.dev',
      role: 'ADMIN',
      status: 'ACTIVE',
      apiKey,
      metadata: { name: 'Demo User', demo: true },
    },
  });
  console.log('User:', user.id);

  // Link user to tenant
  await prisma.userTenant.upsert({
    where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
    update: {},
    create: {
      userId: user.id,
      tenantId: tenant.id,
      role: 'ADMIN',
    },
  });

  // Create an API key record
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  await prisma.apiKey.upsert({
    where: { keyHash },
    update: {},
    create: {
      userId: user.id,
      name: 'Demo API Key',
      keyHash,
      prefix: apiKey.substring(0, 12),
      scopes: ['documents:read', 'documents:write', 'admin:read'],
      rateLimitPerDay: 1000,
    },
  });

  console.log('Seed complete.');
  console.log('Demo API key:', apiKey);
  console.log('Use this key in the X-API-Key header or register a new account via POST /api/v1/auth/register');
}

main()
  .catch(e => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
