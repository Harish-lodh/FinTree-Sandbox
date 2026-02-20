import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getAppStatus() {
    return {
      success: true,
      message: 'Thirdparty API Middleware is running',
      data: {
        name: 'thirdparty-api-middleware',
        version: '1.0.0',
        description: 'Centralized middleware for Indian third-party compliance & fintech APIs',
        timestamp: new Date().toISOString(),
      },
    };
  }
}
