import { Router } from 'express';
import { login, validateUser, logout, changePassword } from '../handlers/auth.handler';
import { loginValidator } from '../middleware/validators';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Public routes
router.post('/login', loginValidator, login);
router.post('/logout', logout);

// Protected routes
router.get('/me', authMiddleware(), validateUser);
router.post('/change-password', authMiddleware(), changePassword);

export default router;
