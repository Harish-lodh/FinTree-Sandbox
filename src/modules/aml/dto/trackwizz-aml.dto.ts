import {
  ApiHideProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
} from 'class-validator';

export class TrackwizzAmlVerificationDto {
  @ApiHideProperty()
  @IsOptional()
  @IsString()
  lan?: string;

  @ApiHideProperty()
  @IsOptional()
  @IsString()
  customerCode?: string;

  @ApiHideProperty()
  @IsOptional()
  @IsString()
  partnerCode?: string;

  @ApiHideProperty()
  @IsOptional()
  @IsString()
  applicationRefNumber?: string;

  @ApiPropertyOptional({
    example: 'CUSTOMER FULL NAME',
    description: 'Full customer name. TrackWizz receives this in firstName.',
  })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiHideProperty()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiHideProperty()
  @IsOptional()
  @IsString()
  fatherName?: string;

  @ApiPropertyOptional({
    example: 'ABCDE1234F',
    description: 'Customer PAN number',
  })
  @IsOptional()
  @IsString()
  pan?: string;

  @ApiPropertyOptional({
    example: '9876543210',
    description: 'Customer mobile number',
  })
  @IsOptional()
  @IsString()
  mobile?: string;

  @ApiPropertyOptional({
    example: 'customer@example.com',
    description: 'Customer email address',
  })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({
    example: '01-Jan-1990',
    description: 'Date of birth in DD-MMM-YYYY format',
  })
  @IsOptional()
  @IsString()
  dob?: string;

  @ApiPropertyOptional({
    example: '01',
    description: 'Gender as 01/02/03 or male/female/transgender',
  })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiHideProperty()
  @IsOptional()
  @IsString()
  createdAt?: string;

  @ApiHideProperty()
  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @ApiHideProperty()
  @IsOptional()
  @IsString()
  requestId?: string;

  @ApiHideProperty()
  @IsOptional()
  @IsString()
  sourceSystemName?: string;

  @ApiHideProperty()
  @IsOptional()
  @IsString()
  purpose?: string;

  @ApiHideProperty()
  @IsOptional()
  @IsArray()
  customerList?: Record<string, any>[];
}
