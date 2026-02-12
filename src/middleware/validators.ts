import { body, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { sendError, HttpStatus } from '../utils/response';

/**
 * Middleware to handle validation errors
 */
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    sendError(
      res,
      'Validation failed',
      HttpStatus.BAD_REQUEST,
      errors.array()
    );
    return;
  }
  next();
};


export const loginValidator = [
  body('email')
    .isString()
    .withMessage('Valid ID is required')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 1 })
    .withMessage('Password is required'),
  handleValidationErrors,
];
