import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger';

import { PanService } from './pan.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';

class VerifyPanDto {
  panNumber: string;
  name?: string;
  dob?: string;
}

@ApiTags('PAN')
@ApiSecurity('X-API-Key')
@Controller('pan')
export class PanController {

  constructor(private readonly panService: PanService) {}

  @Post('verify')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Verify PAN card details' })

  @ApiResponse({ status: 200, description: 'PAN verification successful' })
  @ApiResponse({ status: 400, description: 'Invalid PAN number' })
  async verifyPan(@Body() dto: any) {
    console.log('verifyPan DTO:', dto);
    const result = await this.panService.verifyPan(dto.panNumber, dto.name);
    return result;
  }

  @Post('validate')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Validate PAN with name match' })

  @ApiResponse({ status: 200, description: 'PAN validation successful' })
  @ApiResponse({ status: 400, description: 'Invalid PAN or name' })
  async validatePan(@Body() dto: any) {
    if (!dto.panNumber || !dto.name) {
      return {
        success: false,
        message: 'PAN number and name are required',
      };
    }
    const result = await this.panService.validatePan(dto.panNumber, dto.name);
    return result;
  }

  @Get(':panNumber')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Get PAN card details' })

  @ApiResponse({ status: 200, description: 'PAN details retrieved' })
  @ApiResponse({ status: 404, description: 'PAN not found' })
  async getPanDetails(@Param('panNumber') panNumber: string) {
    const result = await this.panService.getPanDetails(panNumber);
    return {
      success: true,
      message: 'PAN details retrieved',
      data: result.data,
    };
  }
}
