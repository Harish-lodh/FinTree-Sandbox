import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * ApiKeyGuard - A clean, production-ready guard for X-API-Key authentication.
 *
 * This guard:
 * - Reads the X-API-Key header from incoming requests
 * - Compares it with the API_KEY environment variable
 * - Allows the request if they match
 * - Throws UnauthorizedException if invalid or missing
 *
 * Usage:
 * - Apply globally in main.ts: app.useGlobalGuards(new ApiKeyGuard())
 * - Or apply per controller: @UseGuards(ApiKeyGuard)
 * - Or apply per route: @UseGuards(ApiKeyGuard)
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    const allowTrackwizzReportOpen =
      this.reflector.getAllAndOverride<boolean>('allowTrackwizzReportOpen', [
        context.getHandler(),
        context.getClass(),
      ]) ||
      this.reflector.getAllAndOverride<boolean>('allowTrackwizzReportToken', [
        context.getHandler(),
        context.getClass(),
      ]);

    if (
      allowTrackwizzReportOpen &&
      (this.isPublicTrackwizzReportRequest(request) ||
        this.isValidTrackwizzReportToken(request))
    ) {
      request.user = {
        authType: 'trackwizz-report-open',
        id: 'trackwizz-report-open',
      };

      return true;
    }

    // Check if API key is present
    if (!apiKey) {
      this.logger.warn('Authentication failed: No X-API-Key header provided');
      throw new UnauthorizedException('API Key required. Provide X-API-Key header.');
    }

    if(apiKey !== process.env.API_KEY) {
      throw new UnauthorizedException('Invalid API Key. Access denied.');
    }
    // Attach auth info to request for downstream use
    request.user = {
      authType: 'api-key',
      id: 'api-key-user',
    };

    return true;
  }

  private isValidTrackwizzReportToken(request: any): boolean {
    const token = Array.isArray(request.query?.token)
      ? request.query.token[0]
      : request.query?.token;
    const requestId = request.params?.requestId;
    const secret =
      process.env.TW_REPORT_TOKEN_SECRET ||
      process.env.TRACKWIZZ_REPORT_TOKEN_SECRET ||
      process.env.API_KEY ||
      '';

    if (!token || !requestId || !secret) {
      return false;
    }

    const [expiresAtText, signature] = String(token).split('.');
    const expiresAt = Number(expiresAtText);

    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt || !signature) {
      return false;
    }

    const expectedSignature = createHmac('sha256', secret)
      .update(`${requestId}.${expiresAt}`)
      .digest('base64url');
    const expectedBuffer = Buffer.from(expectedSignature);
    const actualBuffer = Buffer.from(signature);

    return (
      expectedBuffer.length === actualBuffer.length &&
      timingSafeEqual(expectedBuffer, actualBuffer)
    );
  }

  private isPublicTrackwizzReportRequest(request: any): boolean {
    return request.method === 'GET' && !!request.params?.requestId;
  }
}
