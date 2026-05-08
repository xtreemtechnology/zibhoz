require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$connect();
    console.log('Connected to database');
    await prisma.$disconnect();
  } catch (error) {
    console.error('Failed to connect to database:', error);
  }
}

main();
