import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';

export class ChequeOcrFormDto {
  @ApiPropertyOptional({ 
    type: 'string', 
    format: 'binary',
    description: 'Cheque image file',
  })
  @IsOptional()
  imageUrl?: any;

  // @ApiProperty({ 
  //   example: 'CLT21',
  //   description: 'Client reference ID for tracking the request',
  //   required: true 
  // })
  // @IsString()
  // @IsNotEmpty({ message: 'Client reference ID is required' })
  // clientRefId: string;

  @ApiProperty({ 
    example: 'Sanu Kumar',
    description: 'Name of the account holder as per bank records',
    required: true 
  })
  @IsString()
  @IsOptional()
  @IsNotEmpty({ message: 'Account holder name is required' })
  accountHolderName: string;

}
