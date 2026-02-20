import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';


@ApiTags('Health')
@ApiSecurity('X-API-Key')
@Controller('health')
export class HealthController {

  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Check service health' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  checkHealth() {
    return this.healthService.checkHealth();
  }

  @Get('detailed')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Detailed health check' })


  @ApiResponse({ status: 200, description: 'Detailed health information' })
  checkDetailedHealth() {
    return this.healthService.checkDetailedHealth();
  }
}
