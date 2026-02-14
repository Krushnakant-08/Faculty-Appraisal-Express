import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import  { AddUser } from '../handlers/admin.handler';
const router = Router();

// All admin routes require admin role
router.use(authMiddleware('admin'));

router.post('/create-user', AddUser);

export default router;
