import { Router } from 'express';
import authRoutes from './auth.routes';
import adminRoutes from './admin.routes';

const router: Router = Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Register all routes
router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);


export default router;
