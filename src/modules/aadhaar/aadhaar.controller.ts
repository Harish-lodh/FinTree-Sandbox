import { Controller, Post, Get, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger';

import { AadhaarService } from './aadhaar.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { GenerateOtpDto, VerifyOtpDto, OfflineVerifyDto, GenerateKycLinkDto, FetchKycDetailsDto } from './dto/aadhaar.dto';

@ApiTags('Aadhaar')
@ApiSecurity('X-API-Key')
@UseGuards(ApiKeyGuard)
@Controller('aadhaar')
export class AadhaarController {
  constructor(private readonly aadhaarService: AadhaarService) {}

  @Post('generate-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate OTP for Aadhaar verification' })
  @ApiResponse({ status: 200, description: 'OTP sent successfully' })
  @ApiResponse({ status:400, description: 'Validation error' })
  async generateOtp(@Body() dto: GenerateOtpDto) {
    return this.aadhaarService.generateAadhaarOtp(dto.aadhaarNumber);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify Aadhaar OTP' })
  @ApiResponse({ status: 200, description: 'Aadhaar verified successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.aadhaarService.verifyAadhaarOtp(dto.requestId, dto.otp);
  }

  @Get('details/:requestId')
  @ApiOperation({ summary: 'Get Aadhaar details' })
  @ApiResponse({ status: 200, description: 'Aadhaar details retrieved' })
  async getDetails(@Param('requestId') requestId: string) {
    return this.aadhaarService.getAadhaarDetails(requestId);
  }

  @Post('offline-verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify offline Aadhaar XML' })
  @ApiResponse({ status: 200, description: 'Offline Aadhaar verified successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async verifyOffline(@Body() dto: OfflineVerifyDto) {
    return this.aadhaarService.verifyOfflineAadhaar(dto.xmlData);
  }

  // -------------------- KYC LINK (DIGITAP) --------------------
  @Post('generate-kyc-link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Generate KYC link sent to customer mobile number via Digitap',
    description: 'Generates a KYC link that is sent to the customer\'s mobile number via Digitap SMS. The customer completes KYC through the Digitap app/portal.'
  })
  @ApiResponse({ status: 200, description: 'KYC link sent to mobile successfully' })
  @ApiResponse({ status: 400, description: 'Validation error or missing configuration' })
  async generateKycLink(@Body() dto: GenerateKycLinkDto) {
    return this.aadhaarService.generateKycLink({
      firstName: dto.firstName,
      lastName: dto.lastName,
      uid: dto.uid,
      mobile: dto.mobile,
      emailId: dto.emailId,
      redirectionUrl: dto.redirectionUrl,
    });
  }

  @Post('kyc-details')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Fetch KYC details after customer completes KYC',
    description: 'Retrieves the KYC details using the transaction ID from the generate-kyc-link response after the customer has completed the KYC process.'
  })
  @ApiResponse({ status: 200, description: 'KYC details retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Validation error or missing transaction ID' })
  async fetchKycDetails(@Body() dto: FetchKycDetailsDto) {
    return this.aadhaarService.fetchKycDetails(dto.transactionId);
  }
}
