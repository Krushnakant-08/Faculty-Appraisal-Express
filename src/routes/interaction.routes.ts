import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { 
  createExternal, 
  getExternals, 
  deleteExternal,
  assignDeanToExternal,
  assignFacultiesToExternal,
  getInteractionDeans,
  toggleInteractionDean
} from '../handlers/interaction.handler';

const router = Router();


// External faculty management
router.post('/:department/create-external', authMiddleware('hod'), createExternal);
router.get('/:department/get-externals', authMiddleware('hod'), getExternals);
router.delete('/:department/external/:userId', authMiddleware('hod'), deleteExternal);

// Assignment routes
router.put('/:department/external/:userId/assign-dean', authMiddleware('hod'), assignDeanToExternal);
router.put('/:department/external/:userId/assign-faculties', authMiddleware('hod'), assignFacultiesToExternal);

// Interaction dean management
router.get('/:department/interaction-deans', authMiddleware('hod'), getInteractionDeans);
router.put('/:department/dean/:userId/toggle-interaction', authMiddleware('hod'), toggleInteractionDean);

export default router;
