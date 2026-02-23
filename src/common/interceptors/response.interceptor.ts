import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { ApiTransactionLogsService } from '../../modules/api-transaction-logs/api-transaction-logs.service';

export interface Response<T> {
  success: boolean;
  message: string;
  data?: T;
  error?: any;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, Response<T>> {
  private readonly logger = new Logger(ResponseInterceptor.name);

  constructor(private readonly apiTransactionLogsService: ApiTransactionLogsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const startTime = Date.now();

    // Extract request metadata
    const method = request.method;
    const url = request.url;
    const headers = request.headers;
    const body = request.body;
    const query = request.query;

    // Get caller information
    const callerId = request.user?.id || headers['x-caller-id'] || 'unknown';
    const authType = 'api-key'; // Only API Key authentication is supported
    const service = this.extractServiceFromUrl(url);

    const endpoint = this.extractEndpointFromUrl(url);

    return next.handle().pipe(
      map((data) => {
        const statusCode = response.statusCode;
        const success = statusCode >= 200 && statusCode < 300;

        // Build standardized response - preserve provider field if present
        const responseBody: any = {
          success,
          message: data?.message || (success ? 'Operation successful' : 'Operation failed'),
          data: data?.data || data || null,
          error: data?.error || null,
        };

        // Preserve provider if it exists in the original response
        if (data?.provider) {
          responseBody.provider = data.provider;
        }

        return responseBody;
      }),
      tap(async (data) => {
        const durationMs = Date.now() - startTime;

        // Log to database
        try {
          await this.apiTransactionLogsService.logTransaction({
            authType,
            callerId: callerId as string,
            service,
            endpoint,
            requestPayload: JSON.stringify({ method, url, body, query }),
            responseData: JSON.stringify(data),
            status: data.success ? 'success' : 'error',
            durationMs,
          });
        } catch (error) {
          this.logger.error(`Failed to log transaction: ${error.message}`);
        }

        this.logger.log(
          `${method} ${url} - ${data.success ? 'SUCCESS' : 'ERROR'} - ${durationMs}ms`,
        );
      }),
    );
  }

  private extractServiceFromUrl(url: string): string {
    const parts = url.split('/').filter(Boolean);
    return parts[0] || 'unknown';
  }

  private extractEndpointFromUrl(url: string): string {
    const parts = url.split('/').filter(Boolean);
    return parts.slice(1).join('/') || 'unknown';
  }
}
