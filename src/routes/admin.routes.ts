import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import  { AddUser } from '../handlers/admin.handler';
const router = Router();

// All admin routes require admin role
router.post('/create-user', AddUser);


router.use(authMiddleware('admin'));


export default router;
