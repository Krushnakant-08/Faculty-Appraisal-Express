import { Router } from 'express';
import { 
  getVerificationCommitteeByDept,
  createVerificationCommitteeByDept,
  assignFacultiesToCommittee,
  getUnassignedFacultiesByDept
} from '../handlers/verificationTeam.handler';
import { authMiddleware } from '../middleware/auth.middleware';

const router: Router = Router();

// Get all users
router.use(authMiddleware('admin'));

router.post('/unassigned-faculties', getUnassignedFacultiesByDept);
router.post('/verification-committee/get', getVerificationCommitteeByDept);
router.post('/verification-committee/create', createVerificationCommitteeByDept);
router.post('/verification-committee/assign', assignFacultiesToCommittee);

export default router;
