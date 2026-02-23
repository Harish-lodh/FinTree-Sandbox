import { IsString, IsNotEmpty, IsOptional, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Express } from 'multer';

/**
 * DTO for Cheque OCR request
 * Handles multipart/form-data with file upload
 */
export class ChequeOcrDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Cheque image file',
    required: true,
  })
  @IsNotEmpty({ message: 'Image file is required' })
  imageUrl: Express.Multer.File;

  @ApiProperty({
    type: String,
    description: 'Client reference ID',
    example: 'CLT-2024-001',
  })
  @IsString()
  @IsNotEmpty({ message: 'Client reference ID is required' })
  clientRefId: string;

  @ApiProperty({
    type: String,
    description: 'Account holder name',
    example: 'John Doe',
  })
  @IsString()
  @IsNotEmpty({ message: 'Account holder name is required' })
  accountHolderName: string;

  @ApiProperty({
    type: String,
    enum: ['yes', 'no'],
    description: 'Is this a complete cheque image?',
    example: 'yes',
  })
  @IsString()
  @IsNotEmpty({ message: 'isCompleteImage is required' })
  @IsEnum(['yes', 'no'], { message: 'isCompleteImage must be either "yes" or "no"' })
  isCompleteImage: any;
}

/**
 * DTO for Cheque OCR response details
 */
export class ChequeOcrResultDetails {
  @ApiProperty({ description: 'Confidence score' })
  conf: number;

  @ApiProperty({ description: 'Extracted value' })
  value: string;
}

/**
 * DTO for Cheque OCR result item
 */
export class ChequeOcrResultItem {
  @ApiProperty({ description: 'Type of OCR (cheque)' })
  type: string;

  @ApiProperty({ description: 'OCR details' })
  details: {
    account_number?: ChequeOcrResultDetails;
    [key: string]: any;
  };
}

/**
 * DTO for Cheque OCR response
 */
export class ChequeOcrResponse {
  @ApiProperty({ description: 'Status of the response', example: 'success' })
  status: string;

  @ApiProperty({ description: 'HTTP status code', example: '200' })
  statusCode: number;

  @ApiProperty({ type: [ChequeOcrResultItem], description: 'OCR results', required: false })
  @ValidateNested({ each: true })
  @Type(() => ChequeOcrResultItem)
  result?: ChequeOcrResultItem[];

  // Error fields for Digitap failure responses
  @ApiPropertyOptional({ description: 'Error message from Digitap', example: 'Bad Request' })
  @IsOptional()
  error?: string;

  @ApiPropertyOptional({ description: 'OCR request ID from Digitap' })
  @IsOptional()
  ocrReqId?: string;

  @ApiPropertyOptional({ description: 'Client reference ID from Digitap' })
  @IsOptional()
  clientRefId?: string;
}
