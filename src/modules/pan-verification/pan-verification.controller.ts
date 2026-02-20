import { Controller, Post, Get, Body, Param, UseGuards, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiSecurity } from '@nestjs/swagger';

import { PanVerificationService } from './pan-verification.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';


// Multer file type
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
  path?: string;
}

class VerifyPanDto {
  panNumber: string;
  name?: string;
  dob?: string;
}

@ApiTags('PAN Verification')
@ApiSecurity('X-API-Key')
@Controller('pan-verification')
export class PanVerificationController {

  constructor(private readonly panVerificationService: PanVerificationService) {}

  @Post('ocr')
  @UseGuards(ApiKeyGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Extract PAN details from image using OCR' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'OCR extraction successful' })
  @ApiResponse({ status: 400, description: 'Invalid file or extraction failed' })
  async ocrPan(@UploadedFile() file: MulterFile) {
    const result = await this.panVerificationService.ocrPan(file);
    return {
      success: result.success,
      message: result.success ? 'PAN extracted successfully' : 'Failed to extract PAN',
      data: result.raw,
    };
  }

  @Post('verify')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Verify PAN card details' })

  @ApiResponse({ status: 200, description: 'PAN verification successful' })
  @ApiResponse({ status: 400, description: 'Invalid PAN number' })
  async verifyPan(@Body() dto: any) {
    console.log('verifyPan DTO:', dto);
    const result = await this.panVerificationService.verifyPan(dto.panNumber, dto.name);
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
    const result = await this.panVerificationService.validatePan(dto.panNumber, dto.name);
    return result;
  }

  @Get(':panNumber')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Get PAN card details' })

  @ApiResponse({ status: 200, description: 'PAN details retrieved' })
  @ApiResponse({ status: 404, description: 'PAN not found' })
  async getPanDetails(@Param('panNumber') panNumber: string) {
    const result = await this.panVerificationService.getPanDetails(panNumber);
    return {
      success: true,
      message: 'PAN details retrieved',
      data: result.data,
    };
  }
}
