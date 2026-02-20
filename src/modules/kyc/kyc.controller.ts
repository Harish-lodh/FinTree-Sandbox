import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger';

import { KycService } from './kyc.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';


class InitiateKycDto {
  phoneNumber: string;
  aadhaarNumber?: string;
}

class VerifyOtpDto {
  requestId: string;
  otp: string;
}

@ApiTags('KYC')
@ApiSecurity('X-API-Key')
@Controller('kyc')
export class KycController {

  constructor(private readonly kycService: KycService) {}

  @Post('initiate')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Initiate KYC process' })

  @ApiResponse({ status: 200, description: 'KYC initiated successfully' })
  async initiateKyc(@Body() dto: InitiateKycDto) {
    const result = await this.kycService.initiateKyc(dto.phoneNumber, dto.aadhaarNumber);
    return {
      success: true,
      message: 'KYC initiated successfully',
      data: result.data,
    };
  }

  @Post('verify-otp')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Verify OTP for KYC' })

  @ApiResponse({ status: 200, description: 'OTP verified successfully' })
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    const result = await this.kycService.verifyOtp(dto.requestId, dto.otp);
    return {
      success: true,
      message: 'OTP verified successfully',
      data: result.data,
    };
  }

  @Get('status/:requestId')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Get KYC status' })

  @ApiResponse({ status: 200, description: 'KYC status retrieved' })
  async getKycStatus(@Param('requestId') requestId: string) {
    const result = await this.kycService.getKycStatus(requestId);
    return {
      success: true,
      message: 'KYC status retrieved',
      data: result.data,
    };
  }
}
