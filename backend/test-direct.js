require('dotenv/config');
const { PrismaClient } = require('@prisma/client');

// Override the DATABASE_URL to use direct connection
process.env.DATABASE_URL = "postgresql://postgres.uxlkjbskbxzdfujlttbl:CXW5tkMlzZ04NRVu@aws-1-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require";

const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$connect();
    console.log('Connected to database via direct connection');
    await prisma.$disconnect();
  } catch (error) {
    console.error('Failed to connect to database:', error.message);
  }
}

main();
