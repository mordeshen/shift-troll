import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import authRoutes from './routes/auth';
import constraintRoutes from './routes/constraints';
import teamRoutes from './routes/team';
import scheduleRoutes from './routes/schedule';
import swapRoutes from './routes/swaps';
import ratingRoutes from './routes/ratings';
import statsRoutes from './routes/stats';
import directorRoutes from './routes/director';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Make prisma available to routes
app.locals.prisma = prisma;

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/constraints', constraintRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/swaps', swapRoutes);
app.use('/api/employees', ratingRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/director', directorRoutes);

// Serve static client in production
import path from 'path';
const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// SPA fallback — serve index.html for all non-API routes
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

export { prisma };
