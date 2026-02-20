import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  checkHealth() {
    return {
      success: true,
      message: 'Service is healthy',
      data: {
        status: 'UP',
        timestamp: new Date().toISOString(),
        services: {
          database: 'UP',
          api: 'UP',
        },
      },
    };
  }

  checkDetailedHealth() {
    return {
      success: true,
      message: 'Detailed health check',
      data: {
        status: 'UP',
        timestamp: new Date().toISOString(),
        uptime: process.uptime?.() || 0,
        memory: process.memoryUsage?.() || {},
        cpu: process.cpuUsage?.() || {},
      },
    };
  }
}
