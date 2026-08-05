import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface HttpExceptionBody {
  statusCode?: number;
  message?: string | string[];
  error?: string;
  code?: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();

    const isHttpException = exception instanceof HttpException;

    const statusCode = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';
    let code = 'INTERNAL_SERVER_ERROR';

    if (isHttpException) {
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        error = exceptionResponse;
        code = `HTTP_${statusCode}`;
      } else {
        const body = exceptionResponse as HttpExceptionBody;

        message = body.message ?? exception.message;
        error = body.error ?? exception.message;
        code = body.code ?? `HTTP_${statusCode}`;
      }
    }

    // Unexpected server errors should be logged but not exposed.
    if (!isHttpException || statusCode >= 500) {
      const stack = exception instanceof Error ? exception.stack : undefined;

      this.logger.error(`${request.method} ${request.url}`, stack);
    }

    response.status(statusCode).json({
      success: false,
      statusCode,
      code,
      error,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
