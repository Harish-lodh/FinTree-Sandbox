import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiSecurity,
} from '@nestjs/swagger';
import { OcrService } from './ocr.service';
import { ChequeOcrResponse } from './dto/cheque-ocr.dto';
import { ChequeOcrFormDto } from './dto/cheque-ocr-form.dto';
import { Express } from 'multer';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';

/**
 * DTO for PAN OCR request body
 */
class PanOcrBodyDto {
  clientRefId?: any;
}

@ApiTags('OCR')
@ApiSecurity('X-API-Key')
@Controller('ocr')
@UseGuards(ApiKeyGuard)
export class OcrController {
  constructor(private readonly ocrService: OcrService) {}

  /**
   * Process Cheque OCR - extracts information from cheque images
   */
  @Post('v1/cheque')
  @UseInterceptors(FileInterceptor('imageUrl'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Process Cheque OCR',
    description:
      'Extracts information from cheque images using OCR. Accepts multipart/form-data with image file and metadata.',
  })
  @ApiBody({
    description: 'Cheque OCR request payload',
    schema: {
      type: 'object',
      properties: {
        imageUrl: { type: 'string', format: 'binary', description: 'Cheque image file' },
        clientRefId: { type: 'string', description: 'Client reference ID (required)' },
        accountHolderName: { type: 'string', description: 'Account holder name (required)' },
        isCompleteImage: { type: 'string', enum: ['yes', 'no'], description: 'Is complete image (required)' },
      },
      required: ['imageUrl', 'clientRefId', 'accountHolderName', 'isCompleteImage'],
    },
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'OCR processed successfully',
    type: ChequeOcrResponse,
  })
  @ApiResponse({ status: 400, description: 'Invalid request parameters' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async processChequeOcr(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: ChequeOcrFormDto,
  ): Promise<ChequeOcrResponse> {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }

    // Validate file type
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(  
        `Invalid file type. Allowed: ${allowedMimeTypes.join(', ')}. Received: ${file.mimetype}`,
      );
    }

    return this.ocrService.processCheque({
      imageUrl: file,
      clientRefId: body.clientRefId,
      accountHolderName: body.accountHolderName,
      isCompleteImage: body.isCompleteImage,
    });
  }

  /**
   * Process PAN card OCR - extracts information from PAN card images
   */
  @Post('v1/pan')
  @UseInterceptors(FileInterceptor('imageUrl'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Process PAN Card OCR',
    description:
      'Extracts information from PAN card images using OCR. Accepts multipart/form-data with image file.',
  })
  @ApiBody({
    description: 'PAN OCR request payload',
    schema: {
      type: 'object',
      properties: {
        imageUrl: { type: 'string', format: 'binary', description: 'PAN card image file' },
        clientRefId: { type: 'string', description: 'Client reference ID for tracking (optional)' },
      },
      required: ['imageUrl'],
    },
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'PAN extracted successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid request parameters' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async processPanOcr(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
  ): Promise<any> {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }

    // Validate file type
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed: ${allowedMimeTypes.join(', ')}. Received: ${file.mimetype}`,
      );
    }

    return this.ocrService.ocrPan(file);
  }
}
