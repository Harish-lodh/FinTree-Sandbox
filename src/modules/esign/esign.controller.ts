import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger';

import { EsignService } from './esign.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';


class InitiateEsignDto {
  documentUrl: string;
  signerName: string;
  signerEmail: string;
}

@ApiTags('eSign')
@ApiSecurity('X-API-Key')
@Controller('esign')
export class EsignController {

  constructor(private readonly esignService: EsignService) {}

  @Post('initiate')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Initiate eSign process' })

  @ApiResponse({ status: 200, description: 'eSign initiated successfully' })
  async initiateEsign(@Body() dto: InitiateEsignDto) {
    const result = await this.esignService.initiateEsign(dto.documentUrl, dto.signerName, dto.signerEmail);
    return {
      success: true,
      message: 'eSign initiated successfully',
      data: result.data,
    };
  }

  @Post('verify/:esignId')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Verify eSign' })

  @ApiResponse({ status: 200, description: 'eSign verified successfully' })
  async verifyEsign(@Param('esignId') esignId: string) {
    const result = await this.esignService.verifyEsign(esignId);
    return {
      success: true,
      message: 'eSign verified successfully',
      data: result.data,
    };
  }

  @Get('status/:esignId')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Get eSign status' })

  @ApiResponse({ status: 200, description: 'eSign status retrieved' })
  async getEsignStatus(@Param('esignId') esignId: string) {
    const result = await this.esignService.getEsignStatus(esignId);
    return {
      success: true,
      message: 'eSign status retrieved',
      data: result.data,
    };
  }
}
