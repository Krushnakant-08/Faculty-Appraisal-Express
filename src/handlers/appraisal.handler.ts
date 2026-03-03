import { Request, Response } from 'express';
import { FacultyAppraisal, IFacultyAppraisal } from '../models/detailedAppraisal';
import { User } from '../models/user';
import { sendSuccess, sendError, HttpStatus } from '../utils/response';
import { type UserRole } from '../constant/userInfo';
import { APPRAISAL_STATUS } from '../constant';

declare global {
  namespace Express {
    interface Request {
      user?: { userId: string; role: UserRole };
    }
  }
}

/** Roles that can view/act on any faculty's appraisal. */
const EVALUATOR_ROLES: UserRole[] = ['director', 'dean', 'hod'];

/**
 * Find an appraisal by userId and return 404 if missing.
 * All handlers use this to avoid repeating the same boilerplate.
 */
async function findAppraisalOrFail(
  res: Response,
  userId: string
): Promise<IFacultyAppraisal | null> {
  const appraisal = await FacultyAppraisal.findOne({ userId });
  if (!appraisal) {
    sendError(res, 'Appraisal not found', HttpStatus.NOT_FOUND);
    return null;
  }
  return appraisal;
}

/**
 * Find an existing appraisal for this userId, or create a fresh DRAFT one.
 * Used by every part-update handler so faculty never have to manually POST to create first.
 * Returns null (and sends a 500) only if the DB write itself fails.
 */
async function findOrCreateAppraisal(
  res: Response,
  userId: string,
  requestingUser: { userId: string; role: UserRole }
): Promise<IFacultyAppraisal | null> {
  const existing = await FacultyAppraisal.findOne({ userId });
  if (existing) return existing;

  // Appraisal doesn't exist yet — auto-create it
  const user = await User.findOne({ userId, status: 'active' });
  if (!user) {
    sendError(res, 'Active user record not found; cannot auto-create appraisal', HttpStatus.NOT_FOUND);
    return null;
  }

  const created = await FacultyAppraisal.create({
    userId,
    role: requestingUser.role,
    designation: user.designation,
    appraisalYear: new Date().getFullYear(),
    status: APPRAISAL_STATUS.PEDING,
  });
  return created;
}

/**
 * Guard: the requesting user must be the appraisal owner.
 * Returns true if the check passes, false + sends 403 if it fails.
 */
function assertOwner(res: Response, requestingUserId: string, targetUserId: string): boolean {
  if (requestingUserId !== targetUserId) {
    sendError(res, 'Unauthorized: you can only modify your own appraisal', HttpStatus.FORBIDDEN);
    return false;
  }
  return true;
}

/**
 * Guard: the appraisal must be in DRAFT status for faculty edits.
 * Returns true if the check passes.
 */
function assertDraft(res: Response, appraisal: IFacultyAppraisal): boolean {
  if (appraisal.status !== APPRAISAL_STATUS.PEDING) {
    sendError(
      res,
      `Appraisal is locked (status: ${appraisal.status}). Only DRAFT appraisals can be edited.`,
      HttpStatus.BAD_REQUEST
    );
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// READ — single
// GET /appraisal/:userId
// ─────────────────────────────────────────────────────────────────────────────

export const getAppraisalByUserId = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const requestingUser = req.user!;

    const isEvaluator = EVALUATOR_ROLES.includes(requestingUser.role);
    const isOwner = requestingUser.userId === userId;

    if (!isOwner && !isEvaluator) {
      sendError(res, 'Unauthorized to view this appraisal', HttpStatus.FORBIDDEN);
      return;
    }

    const appraisal = await findAppraisalOrFail(res, userId);
    if (!appraisal) return;

    sendSuccess(res, appraisal, 'Appraisal retrieved successfully');
  } catch (error) {
    console.error('getAppraisalByUserId error:', error);
    sendError(res, 'Failed to retrieve appraisal', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// READ — by department
// GET /appraisal/department/:department  (dean / hod)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns appraisals scoped to a single department.
 * Resolves department → userIds via the User collection.
 */
export const getAppraisalsByDepartment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { department } = req.params;

    // Resolve userIds that belong to this department
    const usersInDept = await User.find({ department }, { userId: 1, _id: 0 }).lean();
    const userIds = usersInDept.map((u) => u.userId);

    const filter: Record<string, unknown> = { userId: { $in: userIds } };

    const appraisals = await FacultyAppraisal.find(filter)
      .select('userId role designation appraisalYear status summary createdAt updatedAt')
      .sort({ updatedAt: -1 });

    sendSuccess(res, appraisals, 'Appraisals retrieved successfully');
  } catch (error) {
    console.error('getAppraisalsByDepartment error:', error);
    sendError(res, 'Failed to retrieve appraisals', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PART-SPECIFIC UPDATE HANDLERS
// Each handler only touches its own part via $set so no other part is disturbed.
// All faculty-facing updates require: owner + DRAFT status.
// ─────────────────────────────────────────────────────────────────────────────


export const updatePartA = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const requestingUser = req.user!;

    if (!assertOwner(res, requestingUser.userId, userId)) return;

    const appraisal = await findOrCreateAppraisal(res, userId, requestingUser);
    if (!appraisal) return;
    if (!assertDraft(res, appraisal)) return;

    console.log('updatePartA request body:', req.body);
    const updated = await FacultyAppraisal.findOneAndUpdate(
      { userId },
      { $set: { partA: req.body } },
      { new: true, runValidators: true }
    );

    sendSuccess(res, updated, 'Part A saved successfully');
  } catch (error) {
    console.error('updatePartA error:', error);
    sendError(res, 'Failed to save Part A', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};

export const updatePartB = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const requestingUser = req.user!;

    if (!assertOwner(res, requestingUser.userId, userId)) return;

    const appraisal = await findOrCreateAppraisal(res, userId, requestingUser);
    if (!appraisal) return;
    if (!assertDraft(res, appraisal)) return;

    const updated = await FacultyAppraisal.findOneAndUpdate(
      { userId },
      { $set: { partB: req.body } },
      { new: true, runValidators: true }
    );

    sendSuccess(res, updated, 'Part B saved successfully');
  } catch (error) {
    console.error('updatePartB error:', error);
    sendError(res, 'Failed to save Part B', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};

export const updatePartC = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const requestingUser = req.user!;

    if (!assertOwner(res, requestingUser.userId, userId)) return;

    const appraisal = await findOrCreateAppraisal(res, userId, requestingUser);
    if (!appraisal) return;
    if (!assertDraft(res, appraisal)) return;

    const updated = await FacultyAppraisal.findOneAndUpdate(
      { userId },
      { $set: { partC: req.body } },
      { new: true, runValidators: true }
    );

    sendSuccess(res, updated, 'Part C saved successfully');
  } catch (error) {
    console.error('updatePartC error:', error);
    sendError(res, 'Failed to save Part C', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};

export const updatePartD = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const requestingUser = req.user!;

    if (!assertOwner(res, requestingUser.userId, userId)) return;

    const appraisal = await findOrCreateAppraisal(res, userId, requestingUser);
    if (!appraisal) return;
    if (!assertDraft(res, appraisal)) return;

    // Strip evaluator-only fields so faculty cannot self-award dean/hod/director marks
    const {
      deanMarks, hodMarks, directorMarks, adminDeanMarks,
      isMarkDean, isMarkHOD,
      ...facultyFields
    } = req.body;

    const updated = await FacultyAppraisal.findOneAndUpdate(
      { userId },
      { $set: { partD: facultyFields } },
      { new: true, runValidators: true }
    );

    sendSuccess(res, updated, 'Part D saved successfully');
  } catch (error) {
    console.error('updatePartD error:', error);
    sendError(res, 'Failed to save Part D', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};

export const portfolioMarksEvaluator = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const requestingUser = req.user!;

    const appraisal = await findAppraisalOrFail(res, userId);
    if (!appraisal) return;

    if (appraisal.status !== APPRAISAL_STATUS.PORTFOLIO_MARKING_PENDING) {
      sendError(
        res,
        'Evaluator marks can only be entered after the faculty has submitted their portfolio for marking',
        HttpStatus.BAD_REQUEST
      );
      return;
    }

    // Build a targeted $set that only touches the relevant evaluator mark fields
    const setFields: Record<string, unknown> = {};

    const { marks } = req.body as { marks: number };

    if (typeof marks !== 'number' || marks < 0) {
      sendError(res, 'A valid numeric "marks" value is required', HttpStatus.BAD_REQUEST);
      return;
    }

    switch (requestingUser.role) {
      case 'dean':
        setFields['partD.deanMarks'] = marks;
        setFields['partD.isMarkDean'] = true;
        break;
      case 'hod':
        setFields['partD.hodMarks'] = marks;
        setFields['partD.isMarkHOD'] = true;
        break;
      default:
        sendError(res, 'Your role does not permit entering evaluator marks', HttpStatus.FORBIDDEN);
        return;
    }

    const updated = await FacultyAppraisal.findOneAndUpdate(
      { userId },
      { $set: setFields },
      { new: true }
    );

    if (!updated) {
      sendError(res, 'Failed to update appraisal', HttpStatus.INTERNAL_SERVER_ERROR);
      return;
    }

    // Check if all required marks are now complete and auto-update status
    const portfolioType = updated.partD.portfolioType;
    const designation = updated.designation;
    
    let requiresHOD = false;
    let requiresDean = false;

    // Determine requirements based on portfolio type
    if (portfolioType === 'both') {
      requiresHOD = true;
      requiresDean = true;
    } else if (portfolioType === 'institute') {
      requiresDean = true;
    } else if (portfolioType === 'department') {
      requiresHOD = true;
    }

    // Additional check for Associate Deans
    if (designation === 'Associate Dean' && portfolioType !== 'institute') {
      requiresHOD = true;
      requiresDean = true;
    }

    // Check if all required marks are present
    const hodComplete = !requiresHOD || updated.partD.isMarkHOD;
    const deanComplete = !requiresDean || updated.partD.isMarkDean;

    // If all required marks are in, automatically move to MARKS_VERIFICATION_PENDING
    if (hodComplete && deanComplete) {
      updated.status = APPRAISAL_STATUS.MARKS_VERIFICATION_PENDING;
      await updated.save();
      sendSuccess(res, updated, 'Evaluator marks saved successfully. Status updated to Marks Verification Pending.');
    } else {
      sendSuccess(res, updated, 'Evaluator marks saved successfully. Awaiting additional evaluator marks.');
    }
  } catch (error) {
    console.error('portfolioMarksEvaluator error:', error);
    sendError(res, 'Failed to save evaluator marks', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};

export const updatePartE = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const requestingUser = req.user!;

    if (!assertOwner(res, requestingUser.userId, userId)) return;

    const appraisal = await findOrCreateAppraisal(res, userId, requestingUser);
    if (!appraisal) return;
    if (!assertDraft(res, appraisal)) return;

    // Strip the evaluator-only field — faculty cannot award themselves totalVerified marks
    const { totalVerified, ...facultyFields } = req.body;

    const updated = await FacultyAppraisal.findOneAndUpdate(
      { userId },
      { $set: { partE: facultyFields } },
      { new: true, runValidators: true }
    );

    sendSuccess(res, updated, 'Part E saved successfully');
  } catch (error) {
    console.error('updatePartE error:', error);
    sendError(res, 'Failed to save Part E', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DECLARATION
// PATCH /appraisal/:userId/declaration
// ─────────────────────────────────────────────────────────────────────────────


export const updateDeclaration = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const requestingUser = req.user!;

    if (!assertOwner(res, requestingUser.userId, userId)) return;

    const appraisal = await findAppraisalOrFail(res, userId);
    if (!appraisal) return;
    if (!assertDraft(res, appraisal)) return;

    const { isAgreed } = req.body as { isAgreed: boolean };

    if (typeof isAgreed !== 'boolean') {
      sendError(res, '"isAgreed" must be a boolean', HttpStatus.BAD_REQUEST);
      return;
    }

    const updated = await FacultyAppraisal.findOneAndUpdate(
      { userId },
      { $set: { 'declaration.isAgreed': isAgreed } },
      { new: true }
    );

    sendSuccess(res, updated, 'Declaration updated');
  } catch (error) {
    console.error('updateDeclaration error:', error);
    sendError(res, 'Failed to update declaration', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// WORKFLOW: SUBMIT → VERIFY → APPROVE
// ─────────────────────────────────────────────────────────────────────────────

export const submitAppraisal = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const requestingUser = req.user!;

    if (!assertOwner(res, requestingUser.userId, userId)) return;

    const appraisal = await findAppraisalOrFail(res, userId);
    if (!appraisal) return;

    if (appraisal.status !== APPRAISAL_STATUS.PEDING) {
      sendError(
        res,
        `Cannot submit: appraisal is already in ${appraisal.status} status`,
        HttpStatus.BAD_REQUEST
      );
      return;
    }

    
    if (!appraisal.declaration.isAgreed) {
      sendError(
        res,
        'You must agree to the declaration before submitting',
        HttpStatus.BAD_REQUEST
      );
      return;
    }
    
    appraisal.summary.grandTotalClaimed = (appraisal.partA.totalClaimed + appraisal.partB.totalClaimed + appraisal.partC.totalClaimed + appraisal.partD.totalClaimed + appraisal.partE.totalClaimed) > 1000 ? 1000 : (appraisal.partA.totalClaimed + appraisal.partB.totalClaimed + appraisal.partC.totalClaimed + appraisal.partD.totalClaimed + appraisal.partE.totalClaimed);

    appraisal.status = APPRAISAL_STATUS.VERIFICATION_PENDING;
    appraisal.declaration.signatureDate = new Date();
    await appraisal.save();

    sendSuccess(res, appraisal, 'Appraisal submitted successfully');
  } catch (error) {
    console.error('submitAppraisal error:', error);
    sendError(res, 'Failed to submit appraisal', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};



/**
 * POST /appraisal/:userId/verify-marks
 * HOD submits verified marks for sections A, C, D, E (Part B is read-only).
 * Updates the verified totals and moves status to INTERACTION_PENDING.
 */
export const submitVerifiedMarks = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const requestingUser = req.user!;

    // Only HOD can verify marks
    if (requestingUser.role !== 'hod') {
      sendError(res, 'Only HOD can verify marks', HttpStatus.UNAUTHORIZED);
      return;
    }

    const appraisal = await findAppraisalOrFail(res, userId);
    if (!appraisal) return;

    // Get user details to check department
    const user = await User.findOne({ userId });
    if (!user) {
      sendError(res, 'User not found', HttpStatus.NOT_FOUND);
      return;
    }

    // Check if appraisal is in the correct status
    if (appraisal.status !== APPRAISAL_STATUS.MARKS_VERIFICATION_PENDING) {
      sendError(
        res,
        `Cannot verify marks: appraisal is in ${appraisal.status} status`,
        HttpStatus.BAD_REQUEST
      );
      return;
    }

    // Extract verified marks from request body (format: { A: { verified_marks: 250 }, C: {...}, D: {...}, E: {...} })
    const { A, C, D, E } = req.body;

    if (!A || !C || !D || !E) {
      sendError(res, 'Missing verified marks for sections A, C, D, or E', HttpStatus.BAD_REQUEST);
      return;
    }

    // Update verified marks for each section
    if (A.verified_marks !== undefined) {
      appraisal.partA.totalVerified = Number(A.verified_marks);
    }
    // Part B is read-only, no update needed
    if (C.verified_marks !== undefined) {
      appraisal.partC.totalVerified = Number(C.verified_marks);
    }
    if (D.verified_marks !== undefined) {
      appraisal.partD.totalVerified = Number(D.verified_marks);
    }
    if (E.verified_marks !== undefined) {
      appraisal.partE.totalVerified = Number(E.verified_marks);
    }

    // Calculate grand total verified (capped at 1000)
    const totalVerified = 
      appraisal.partA.totalVerified +
      appraisal.partB.totalVerified +
      appraisal.partC.totalVerified +
      appraisal.partD.totalVerified +
      appraisal.partE.totalVerified;

    appraisal.summary.grandTotalVerified = Math.min(1000, totalVerified);

    // Update status to INTERACTION_PENDING
    appraisal.status = APPRAISAL_STATUS.INTERACTION_PENDING;

    await appraisal.save();

    sendSuccess(res, appraisal, 'Marks verified successfully and moved to interaction pending');
  } catch (error) {
    console.error('submitVerifiedMarks error:', error);
    sendError(res, 'Failed to submit verified marks', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};