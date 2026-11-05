import { ArgumentsHost, Catch, ExceptionFilter, HttpException, INestApplication, ValidationPipe } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { JsonLogger } from './json-logger';
import { Environment } from '../config/environment';

export type RequestWithId = Request & { requestId?: string };

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: JsonLogger) {}
  catch(error: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithId>();
    const response = context.getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const body = error instanceof HttpException ? error.getResponse() : null;
    const message = status >= 500 ? status === 503 ? 'Service unavailable' : 'Internal server error' : typeof body === 'object' && body && 'message' in body ? body.message : 'Request rejected';
    this.logger.event(status >= 500 ? 'error' : 'warn', 'request_rejected', { status, requestId: request.requestId });
    response.status(status).json({ error: { status, message, requestId: request.requestId } });
  }
}

export function configureHttp(app: INestApplication, env: Environment, logger: JsonLogger) {
  app.enableCors({ origin: env.CORS_ORIGINS.split(',').map(value => value.trim()).filter(Boolean), credentials: false });
  app.use((request: RequestWithId, response: Response, next: NextFunction) => {
    request.requestId = randomUUID();
    response.setHeader('X-Request-Id', request.requestId);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    const start = Date.now();
    response.on('finish', () => logger.event('info', 'http_request', { method: request.method, route: request.route?.path || 'unmatched', status: response.statusCode, requestId: request.requestId, durationMs: Date.now() - start }));
    next();
  });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true, validationError: { target: false, value: false } }));
  app.useGlobalFilters(new ApiExceptionFilter(logger));
  app.enableShutdownHooks();
}
