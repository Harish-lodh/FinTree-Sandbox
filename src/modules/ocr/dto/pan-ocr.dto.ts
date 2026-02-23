import { IsString, IsNotEmpty, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Express } from 'multer';

/**
 * DTO for PAN OCR request
 * Handles multipart/form-data with file upload
 */
export class PanOcrDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'PAN card image file',
    required: true,
  })
  @IsNotEmpty({ message: 'Image file is required' })
  imageUrl: Express.Multer.File;

  @ApiPropertyOptional({
    type: String,
    description: 'Client reference ID for tracking',
    example: 'CLT-2024-001',
  })
  @IsOptional()
  @IsString()
  clientRefId?: string;
}

/**
 * DTO for PAN OCR response data
 */
export class PanOcrData {
  @ApiProperty({ description: 'PAN number', example: 'AAAPL1234C' })
  pan_number: string;

  @ApiProperty({ description: 'Name on PAN card', example: 'JOHN DOE' })
  name: string;

  @ApiPropertyOptional({ description: 'Date of birth', example: '01/01/1990' })
  dob?: string;

  @ApiPropertyOptional({ description: 'Father name', example: 'JANE DOE' })
  father_name?: string;
}

/**
 * DTO for PAN OCR response
 */
export class PanOcrResponse {
  @ApiProperty({ description: 'Success status', example: true })
  success: boolean;

  @ApiProperty({ description: 'Response message', example: 'PAN extracted successfully' })
  message: string;

  @ApiProperty({ description: 'Provider name', example: 'GOOGLE_VISION' })
  provider: string;

  @ApiProperty({ type: PanOcrData })
  @ValidateNested()
  @Type(() => PanOcrData)
  data: PanOcrData;
}
