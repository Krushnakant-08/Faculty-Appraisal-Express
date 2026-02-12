import { Request, Response, NextFunction } from 'express';
import { sendError, HttpStatus } from '../utils/response';

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  statusCode: number;
  details?: any;

  constructor(message: string, statusCode: number = 400, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.name = 'ApiError';
  }
}

/**
 * Global error handler middleware
 */
export const errorHandler = (
  error: Error | ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error('Error:', error);

  if (error instanceof ApiError) {
    sendError(res, error.message, error.statusCode, error.details);
    return;
  }

  // Prisma errors
  if (error.name === 'PrismaClientKnownRequestError') {
    const prismaError = error as any;
    
    switch (prismaError.code) {
      case 'P2002':
        sendError(res, 'A record with this value already exists', HttpStatus.CONFLICT);
        return;
      case 'P2025':
        sendError(res, 'Record not found', HttpStatus.NOT_FOUND);
        return;
      default:
        sendError(res, 'Database error', HttpStatus.INTERNAL_SERVER_ERROR);
        return;
    }
  }

  // Validation errors
  if (error.name === 'ValidationError') {
    sendError(res, error.message, HttpStatus.BAD_REQUEST);
    return;
  }

  // JWT errors
  if (error.name === 'JsonWebTokenError') {
    sendError(res, 'Invalid token', HttpStatus.UNAUTHORIZED);
    return;
  }

  if (error.name === 'TokenExpiredError') {
    sendError(res, 'Token expired', HttpStatus.UNAUTHORIZED);
    return;
  }

  // Default error
  sendError(
    res,
    process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message,
    HttpStatus.INTERNAL_SERVER_ERROR
  );
};

/**
 * 404 handler for unmatched routes
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  sendError(res, `Route ${req.method} ${req.path} not found`, HttpStatus.NOT_FOUND);
};
