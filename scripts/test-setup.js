#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Testing Document Intelligence API setup...\n');

try {
  // Check if TypeScript compiles
  console.log('1. Checking TypeScript compilation...');
  execSync('npx tsc --noEmit', { stdio: 'inherit' });
  console.log('✅ TypeScript compilation successful\n');
} catch (error) {
  console.log('❌ TypeScript compilation failed');
  process.exit(1);
}

try {
  // Check Prisma schema
  console.log('2. Checking Prisma schema...');
  const prismaSchema = path.join(__dirname, '../prisma/schema.prisma');
  if (fs.existsSync(prismaSchema)) {
    const content = fs.readFileSync(prismaSchema, 'utf8');
    if (content.includes('model') && content.includes('enum')) {
      console.log('✅ Prisma schema looks good\n');
    } else {
      console.log('❌ Prisma schema seems incomplete');
    }
  } else {
    console.log('❌ Prisma schema not found');
    process.exit(1);
  }
} catch (error) {
  console.log('❌ Error checking Prisma schema:', error.message);
  process.exit(1);
}

try {
  // Check if main server file exists
  console.log('3. Checking server structure...');
  const serverFiles = [
    'src/index.ts',
    'src/server.ts',
    'src/api/routes/index.ts',
    'src/services/database.ts',
    'src/services/auth.ts',
    'src/services/storage.ts',
    'src/services/queue.ts',
  ];

  const missingFiles = [];
  for (const file of serverFiles) {
    const filePath = path.join(__dirname, '..', file);
    if (!fs.existsSync(filePath)) {
      missingFiles.push(file);
    }
  }

  if (missingFiles.length === 0) {
    console.log('✅ All required server files exist\n');
  } else {
    console.log('❌ Missing files:', missingFiles.join(', '));
    process.exit(1);
  }
} catch (error) {
  console.log('❌ Error checking server structure:', error.message);
  process.exit(1);
}

try {
  // Check environment example file
  console.log('4. Checking environment configuration...');
  const envExample = path.join(__dirname, '../.env.example');
  if (fs.existsSync(envExample)) {
    const content = fs.readFileSync(envExample, 'utf8');
    const requiredVars = [
      'DATABASE_URL',
      'REDIS_URL',
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'JWT_SECRET',
      'API_KEY_SALT',
    ];

    const missingVars = [];
    for (const varName of requiredVars) {
      if (!content.includes(varName)) {
        missingVars.push(varName);
      }
    }

    if (missingVars.length === 0) {
      console.log('✅ Environment configuration looks good\n');
    } else {
      console.log('❌ Missing environment variables:', missingVars.join(', '));
    }
  } else {
    console.log('❌ .env.example file not found');
    process.exit(1);
  }
} catch (error) {
  console.log('❌ Error checking environment configuration:', error.message);
  process.exit(1);
}

console.log('🎉 Setup test completed successfully!');
console.log('\nNext steps:');
console.log('1. Copy .env.example to .env and fill in your values');
console.log('2. Run database migrations: npx prisma migrate dev');
console.log('3. Start development server: npm run dev');
console.log('4. Start worker process: npm run dev:worker (in another terminal)');
console.log('5. Access API documentation at http://localhost:3000/api-docs');
