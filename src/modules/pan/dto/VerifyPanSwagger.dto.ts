import { ApiProperty, ApiPropertyOptional, ApiHideProperty } from '@nestjs/swagger';
import { IsString, IsOptional, Matches } from 'class-validator';

export class VerifyPanDto {

  @ApiProperty({
    example: 'ABCDE1234F',
    description: 'PAN Card Number',
  })
  @IsString()
  @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)
  panNumber: string;

  @ApiPropertyOptional({
    example: 'ROHIT SHARMA',
    description: 'Full name as per PAN',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiHideProperty()
  @IsOptional()
  @IsString()
  dob?: string;
}