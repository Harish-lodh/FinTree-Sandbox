import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, Matches } from 'class-validator';

export class VerifyPanDto {

  @ApiProperty({
    example: 'ABCDE1234F',
    description: 'PAN Card Number',
  })
  @IsString()
  @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, {
    message: 'Invalid PAN format',
  })
  panNumber: string;

  @ApiPropertyOptional({
    example: 'ROHIT SHARMA',
    description: 'Full name as per PAN',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    example: '1995-08-15',
    description: 'Date of birth (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsString()
  dob?: string;
}