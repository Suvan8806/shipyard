// ServiceError: thrown by lib/services/*, mapped to the ApiError envelope by routes and to tool errors by MCP.
import type { ApiErrorCode } from '../contracts/api';

export const ERROR_STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  not_found: 404,
  invalid_spec: 409,
  conflict: 409,
  rate_limited: 429,
  budget_exceeded: 402,
  internal: 500,
};

export class ServiceError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;
  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = details;
  }
}

export function isServiceError(e: unknown): e is ServiceError {
  return e instanceof ServiceError || (typeof e === 'object' && e !== null && (e as { name?: string }).name === 'ServiceError');
}

export const notFound = (what: string) => new ServiceError('not_found', `${what} not found`);
