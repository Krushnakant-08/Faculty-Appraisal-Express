import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  createExternal,
  getExternals,
  deleteExternal,
  assignDeanToExternal,
  assignFacultiesToExternal,
  getInteractionDeans,
  getInteractionPendingFaculty,
  submitInteractionEvaluation,
  getInteractionEvaluation,
} from '../handlers/interaction.handler';

const router = Router();


// External faculty management
router.post('/:department/create-external', authMiddleware('hod', 'director'), createExternal);
router.get('/:department/get-externals', authMiddleware('hod', 'dean', 'external', 'director'), getExternals);
router.delete('/:department/external/:userId', authMiddleware('hod', 'director'), deleteExternal);

// Assignment routes
router.put('/:department/external/:userId/assign-dean', authMiddleware('hod', 'director'), assignDeanToExternal);
router.put('/:department/external/:userId/assign-faculties', authMiddleware('hod', 'director'), assignFacultiesToExternal);

// Interaction dean management
router.get('/:department/interaction-deans', authMiddleware('hod', 'director'), getInteractionDeans);
router.get('/:department/interaction-pending-faculty', authMiddleware('hod', 'director'), getInteractionPendingFaculty);

// Evaluation routes
router.post('/:department/evaluate/:evaluatorRole/:externalId/:facultyId', authMiddleware('hod', 'dean', 'external', 'director'), submitInteractionEvaluation);
router.get('/:department/evaluation/:externalId/:facultyId', authMiddleware('hod', 'dean', 'external', 'director'), getInteractionEvaluation);

export default router;
