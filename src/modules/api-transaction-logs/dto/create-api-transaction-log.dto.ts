import { IsString, IsEnum, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateApiTransactionLogDto {
  @ApiProperty({
    type: String,
    description: 'Type of authentication used (always api-key)',
    default: 'api-key',
  })
  @IsString()
  authType: string;


  @ApiProperty({
    type: String,
    description: 'ID of the caller making the request',
  })
  @IsString()
  callerId: string;

  @ApiProperty({
    type: String,
    description: 'Service name being called',
  })
  @IsString()
  service: string;

  @ApiProperty({
    type: String,
    description: 'Endpoint being called',
  })
  @IsString()
  endpoint: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Request payload as JSON string',
  })
  @IsOptional()
  @IsString()
  requestPayload?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Response data as JSON string',
  })
  @IsOptional()
  @IsString()
  responseData?: string;

  @ApiPropertyOptional({
    enum: ['success', 'error', 'pending'],
    description: 'Status of the transaction',
  })
  @IsOptional()
  @IsEnum(['success', 'error', 'pending'])
  status?: 'success' | 'error' | 'pending';

  @ApiPropertyOptional({
    type: Number,
    description: 'Duration of the request in milliseconds',
  })
  @IsOptional()
  @IsNumber()
  durationMs?: number;
}
