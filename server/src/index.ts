import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';

dotenv.config();

// Railway uses DATABASE_PUBLIC_URL, Prisma expects DATABASE_URL
if (!process.env.DATABASE_URL && process.env.DATABASE_PUBLIC_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL;
}

console.log('Starting server...');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);

// Catch all uncaught errors
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
});

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Make prisma available to routes
app.locals.prisma = prisma;

// Health check — FIRST, before anything else
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', port: PORT, db: 'connected' });
  } catch (err: any) {
    res.json({ status: 'ok', port: PORT, db: 'error', dbError: err.message });
  }
});

// Routes (lazy load to catch import errors)
try {
  const authRoutes = require('./routes/auth').default;
  const constraintRoutes = require('./routes/constraints').default;
  const teamRoutes = require('./routes/team').default;
  const scheduleRoutes = require('./routes/schedule').default;
  const swapRoutes = require('./routes/swaps').default;
  const ratingRoutes = require('./routes/ratings').default;
  const statsRoutes = require('./routes/stats').default;
  const directorRoutes = require('./routes/director').default;
  const employeeManageRoutes = require('./routes/employees').default;
  const adminRoutes = require('./routes/admin').default;
  const conversationRoutes = require('./routes/conversations').default;

  app.use('/api/auth', authRoutes);
  app.use('/api/constraints', constraintRoutes);
  app.use('/api/team', teamRoutes);
  app.use('/api/schedule', scheduleRoutes);
  app.use('/api/swaps', swapRoutes);
  app.use('/api/employees', ratingRoutes);
  app.use('/api/stats', statsRoutes);
  app.use('/api/director', directorRoutes);
  app.use('/api/manage/employees', employeeManageRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/conversations', conversationRoutes);
  console.log('All routes loaded successfully');
} catch (err) {
  console.error('Error loading routes:', err);
}

// Serve static client in production
const clientDist = path.join(__dirname, '../../client/dist');
const indexHtml = path.join(clientDist, 'index.html');
console.log('Looking for client at:', clientDist);
console.log('Client exists:', fs.existsSync(indexHtml));

if (fs.existsSync(indexHtml)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(indexHtml);
  });
} else {
  app.get('*', (_req, res) => {
    res.json({ message: 'API is running', health: '/api/health' });
  });
}

// Global error handler
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('Express error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

export { prisma };
