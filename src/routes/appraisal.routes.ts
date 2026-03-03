import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  getAppraisalByUserId,
  getAppraisalsByDepartment,
  updatePartA,
  updatePartB,
  updatePartC,
  updatePartD,
  portfolioMarksEvaluator,
  updatePartE,
  updateDeclaration,
  submitAppraisal,
  submitVerifiedMarks,
} from '../handlers/appraisal.handler';
import { downloadAppraisalPDF } from '../handlers/pdf.handler';

const router = Router();

// Every route in this file requires a valid JWT.
router.use(authMiddleware());

// Must be declared BEFORE /:userId to avoid Express matching "department" as a userId.
router.get(
  '/department/:department',
  authMiddleware('hod'),
  getAppraisalsByDepartment
);

// GET /appraisal/:userId/pdf
router.get('/:userId/pdf', downloadAppraisalPDF);

// Fetch the full appraisal document — owner or evaluator roles.
router.get('/:userId', getAppraisalByUserId);

router.put('/:userId/part-a', updatePartA);
router.put('/:userId/part-b', updatePartB);
router.put('/:userId/part-c', updatePartC);
router.put('/:userId/part-d', updatePartD);
router.put('/:userId/part-e', updatePartE);


router.patch('/:userId/declaration', updateDeclaration);
router.patch('/:userId/submit', submitAppraisal);

// HOD submits verified marks and moves to interaction pending
router.post('/:userId/verify-marks', authMiddleware('hod'), submitVerifiedMarks);

router.put(
  '/:userId/part-d/evaluator',
  authMiddleware('dean', 'hod'),
  portfolioMarksEvaluator
);

export default router;
