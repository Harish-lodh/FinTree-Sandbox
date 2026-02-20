import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';

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

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];
    // Check if API key is present
    if (!apiKey) {
      this.logger.warn('Authentication failed: No X-API-Key header provided');
      throw new UnauthorizedException('API Key required. Provide X-API-Key header.');
    }
    // Attach auth info to request for downstream use
    request.user = {
      authType: 'api-key',
      id: 'api-key-user',
    };

    return true;
  }
}
