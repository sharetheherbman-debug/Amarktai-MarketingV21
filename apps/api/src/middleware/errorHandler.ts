import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { logger } from '../utils/logger';
import { ApiResponse } from '../types';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(statusCode: number, message: string, code: string = 'ERROR', isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(404, `${resource} not found`, 'NOT_FOUND');
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message, 'VALIDATION_ERROR');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(401, message, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(403, message, 'FORBIDDEN');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message, 'CONFLICT');
  }
}

function formatZodError(error: ZodError): string {
  return error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
}

export function errorHandler(err: Error, req: Request, res: Response<ApiResponse>, _next: NextFunction): void {
  if (err instanceof AppError) {
    logger.warn(`AppError: ${err.message}`, { statusCode: err.statusCode, code: err.code, path: req.path });
    res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        code: err.code,
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    const message = formatZodError(err);
    logger.warn(`Validation error: ${message}`, { path: req.path });
    res.status(400).json({
      success: false,
      error: {
        message,
        code: 'VALIDATION_ERROR',
      },
    });
    return;
  }

  if (err instanceof TokenExpiredError) {
    logger.warn('Token expired', { path: req.path });
    res.status(401).json({
      success: false,
      error: {
        message: 'Token expired',
        code: 'TOKEN_EXPIRED',
      },
    });
    return;
  }

  if (err instanceof JsonWebTokenError) {
    logger.warn('Invalid token', { path: req.path });
    res.status(401).json({
      success: false,
      error: {
        message: 'Invalid token',
        code: 'INVALID_TOKEN',
      },
    });
    return;
  }

  if (err.message?.includes('unique') || err.message?.includes('duplicate')) {
    logger.warn(`Conflict error: ${err.message}`, { path: req.path });
    res.status(409).json({
      success: false,
      error: {
        message: 'Resource already exists',
        code: 'CONFLICT',
      },
    });
    return;
  }

  logger.error('Unhandled error', { error: err.message, stack: err.stack, path: req.path });
  res.status(500).json({
    success: false,
    error: {
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
      code: 'INTERNAL_ERROR',
    },
  });
}
