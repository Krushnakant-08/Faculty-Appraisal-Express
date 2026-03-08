import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { 
  createExternal, 
  getExternals, 
  deleteExternal,
  assignDeanToExternal,
  assignFacultiesToExternal,
  getInteractionDeans,
  submitInteractionEvaluation,
  getInteractionEvaluation,
} from '../handlers/interaction.handler';

const router = Router();


// External faculty management
router.post('/:department/create-external', authMiddleware('hod'), createExternal);
router.get('/:department/get-externals', authMiddleware('hod', 'dean', 'external'), getExternals);
router.delete('/:department/external/:userId', authMiddleware('hod'), deleteExternal);

// Assignment routes
router.put('/:department/external/:userId/assign-dean', authMiddleware('hod'), assignDeanToExternal);
router.put('/:department/external/:userId/assign-faculties', authMiddleware('hod'), assignFacultiesToExternal);

// Interaction dean management
router.get('/:department/interaction-deans', authMiddleware('hod'), getInteractionDeans);

// Evaluation routes
router.post('/:department/evaluate/:evaluatorRole/:externalId/:facultyId', authMiddleware('hod', 'dean', 'external'), submitInteractionEvaluation);
router.get('/:department/evaluation/:externalId/:facultyId', authMiddleware('hod', 'dean', 'external'), getInteractionEvaluation);

export default router;
