import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  ApiBody,
  ApiConsumes,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';

import { EsignService } from './esign.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { Express } from 'multer';

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const SIGN_POSITIONS = ['BOTTOM_RIGHT', 'BOTTOM_LEFT', 'TOP_RIGHT', 'TOP_LEFT'] as const;
type SignPosition = (typeof SIGN_POSITIONS)[number];

class InitiateEsignDto {
  @ApiPropertyOptional({
    description: 'Public PDF URL, data URI, or base64 PDF data (only used when no file is uploaded)',
  })
  @IsOptional()
  @IsString()
  documentUrl?: string;

  @ApiProperty({ description: 'Signer full name' })
  @IsString()
  @IsNotEmpty()
  signerName: string;

  @ApiPropertyOptional({ description: 'Signer email address' })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsEmail()
  signerEmail?: string;

  @ApiPropertyOptional({ description: 'Signer mobile number' })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsString()
  signerMobile?: string;

  @ApiPropertyOptional({ description: 'Document file name sent to the provider' })
  @IsOptional()
  @IsString()
  documentName?: string;

  @ApiPropertyOptional({ description: 'Provider callback URL' })
  @IsOptional()
  @IsString()
  callbackUrl?: string;

  @ApiPropertyOptional({ description: 'Signer redirect URL after signing' })
  @IsOptional()
  @IsString()
  redirectUrl?: string;

  @ApiPropertyOptional({ description: 'Request expiry in days', default: 1 })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  expireInDays?: number;

  @ApiPropertyOptional({ description: 'Signature type, e.g. aadhaar, electronic, or dsc' })
  @IsOptional()
  @IsString()
  signType?: string;

  @ApiPropertyOptional({ description: 'Reason shown for signing' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ enum: SIGN_POSITIONS, default: 'BOTTOM_RIGHT' })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsIn(SIGN_POSITIONS)
  signPosition?: SignPosition;

  @ApiPropertyOptional({ description: 'Provider-specific signing coordinates (JSON object)' })
  @IsOptional()
  @Transform(({ value }) => {
    // Multipart fields arrive as strings.
    if (typeof value !== 'string') return value;
    if (!value.trim()) return undefined;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  })
  @IsObject()
  coordinates?: Record<string, any>;
}

@ApiTags('eSign')
@ApiSecurity('X-API-Key')
@Controller('esign')
export class EsignController {

  constructor(private readonly esignService: EsignService) {}

  @Post('initiate')
  @UseGuards(ApiKeyGuard)
  @UseInterceptors(FileInterceptor('document', { limits: { fileSize: MAX_PDF_BYTES } }))
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({ summary: 'Initiate eSign process' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        document: { type: 'string', format: 'binary', description: 'PDF file to be signed' },
        signerName: { type: 'string', default: '' },
        signerEmail: { type: 'string', default: '' },
        signerMobile: { type: 'string', default: '' },
        documentName: { type: 'string', default: '', description: 'Defaults to the uploaded file name' },
        signType: { type: 'string', example: 'aadhaar' },
        reason: { type: 'string', default: '', description: 'Defaults to "Agreement signing"' },
        expireInDays: { type: 'number', default: 1, description: 'Defaults to 1 day' },
        callbackUrl: { type: 'string', default: '' },
        redirectUrl: {
          type: 'string',
          default: '',
          description: 'Defaults to ESIGN_REDIRECT_URL / AADHAAR_REDIRECT_URL from env',
        },
        signPosition: {
          type: 'string',
          enum: [...SIGN_POSITIONS],
          default: 'BOTTOM_RIGHT',
          description: 'Where the signature is placed on every page',
        },
      },
      required: ['document', 'signerName'],
    },
  })
  @ApiResponse({ status: 200, description: 'eSign initiated successfully' })
  async initiateEsign(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: InitiateEsignDto,
  ) {
    if (file) {
      const isPdf =
        file.mimetype === 'application/pdf' ||
        file.buffer.subarray(0, 5).toString() === '%PDF-';
      if (!isPdf) {
        throw new BadRequestException(`Only PDF files are allowed. Received: ${file.mimetype}`);
      }
    } else if (!dto.documentUrl) {
      throw new BadRequestException('Upload a PDF in the "document" field');
    }

    const result = await this.esignService.initiateEsign({
      ...dto,
      documentUrl: file ? file.buffer.toString('base64') : dto.documentUrl!,
      documentName: dto.documentName || file?.originalname,
    });
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
