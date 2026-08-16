import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

function validationMessage(error: ZodError): string {
  return error.errors.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
}

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const original = req.body && typeof req.body === 'object' ? req.body : {};
      const parsed = schema.parse(original);
      req.body = { ...original, ...(parsed as Record<string, unknown>) };
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: { message: validationMessage(error), code: 'VALIDATION_ERROR' },
        });
        return;
      }
      next(error);
    }
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const original = req.query && typeof req.query === 'object' ? req.query : {};
      const parsed = schema.parse(original);
      req.query = { ...original, ...(parsed as Record<string, unknown>) } as typeof req.query;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: { message: validationMessage(error), code: 'VALIDATION_ERROR' },
        });
        return;
      }
      next(error);
    }
  };
}

export function validateParams(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.params = schema.parse(req.params) as typeof req.params;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: { message: validationMessage(error), code: 'VALIDATION_ERROR' },
        });
        return;
      }
      next(error);
    }
  };
}
