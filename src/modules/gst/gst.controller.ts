import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger';

import { GstService } from './gst.service';
import { VerifyGstDto } from './dto/gst.dto';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';

@ApiTags('GST')
@ApiSecurity('X-API-Key')
@Controller('gst')
export class GstController {
  constructor(private readonly gstService: GstService) {}

  @Post('verify')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Verify GST number details' })
  @ApiResponse({ status: 200, description: 'GST verification successful' })
  @ApiResponse({ status: 400, description: 'Invalid GST number' })
  async verifyGst(@Body() dto: VerifyGstDto) {
    const result = await this.gstService.getGstDetails(dto.gstNumber);
    return result;
  }
}
