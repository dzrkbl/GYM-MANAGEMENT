import { Response } from 'express';

// Standardized response format
export type ApiResponse<T = any> = 
  | { success: true; data: T }
  | { success: false; error: string; issues?: any[] };

export function sendSuccess<T>(res: Response, data: T, statusCode = 200) {
  return res.status(statusCode).json({ success: true, data } as ApiResponse<T>);
}

export function sendError(res: Response, message: string, statusCode = 400, issues?: any[]) {
  return res.status(statusCode).json({ success: false, error: message, issues } as ApiResponse);
}
