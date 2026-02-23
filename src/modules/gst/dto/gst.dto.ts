import { IsString, IsNotEmpty, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyGstDto {
  @ApiProperty({
    description: 'GST Number to verify',
    example: '29AABCU9603R1ZM',
  })
  @IsString()
  @IsNotEmpty()
  @Length(15, 15, { message: 'GST number must be exactly 15 characters' })
  gstNumber: string;
}
