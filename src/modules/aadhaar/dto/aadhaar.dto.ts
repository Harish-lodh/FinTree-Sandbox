import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateOtpDto {
  @ApiProperty({
    description: 'Aadhaar number (12 digits)',
    example: '123456789012',
    type: String,
  })
  @IsString({ message: 'Aadhaar number must be a string' })
  @IsNotEmpty({ message: 'Aadhaar number is required' })
  aadhaarNumber: string;
}

export class VerifyOtpDto {
  @ApiProperty({
    description: 'Request ID from OTP generation',
    example: 'abc123def456',
    type: String,
  })
  @IsString({ message: 'Request ID must be a string' })
  @IsNotEmpty({ message: 'Request ID is required' })
  requestId: string;

  @ApiProperty({
    description: 'OTP received on Aadhaar registered mobile',
    example: '123456',
    type: String,
  })
  @IsString({ message: 'OTP must be a string' })
  @IsNotEmpty({ message: 'OTP is required' })
  otp: string;
}

export class OfflineVerifyDto {
  @ApiProperty({
    description: 'XML data from Aadhaar offline QR code',
    example: '<XML>...</XML>',
    type: String,
  })
  @IsString({ message: 'XML data must be a string' })
  @IsNotEmpty({ message: 'XML data is required' })
  xmlData: string;
}

export class GenerateKycLinkDto {
  @ApiProperty({
    description: 'First name of the customer',
    example: 'John',
    type: String,
  })
  @IsString({ message: 'First name must be a string' })
  @IsNotEmpty({ message: 'First name is required' })
  firstName: string;

  @ApiProperty({
    description: 'Last name of the customer',
    example: 'Doe',
    type: String,
  })
  @IsString({ message: 'Last name must be a string' })
  @IsNotEmpty({ message: 'Last name is required' })
  lastName: string;

  @ApiProperty({
    description: 'Aadhaar UID number (12 digits)',
    example: '123456789012',
    type: String,
  })
  @IsString({ message: 'UID must be a string' })
  @IsNotEmpty({ message: 'UID is required' })
  uid: string;

  @ApiProperty({
    description: 'Mobile number to send the KYC link',
    example: '9876543210',
    type: String,
  })
  @IsString({ message: 'Mobile must be a string' })
  @IsNotEmpty({ message: 'Mobile number is required' })
  mobile: string;

  @ApiProperty({
    description: 'Email ID of the customer (optional)',
    example: 'john.doe@example.com',
    type: String,
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'Email must be a string' })
  emailId?: string;

  @ApiProperty({
    description: 'URL to redirect after KYC completion',
    example: 'https://yourdomain.com/kyc-callback',
    type: String,
  })
  @IsString({ message: 'Redirection URL must be a string' })
  @IsNotEmpty({ message: 'Redirection URL is required' })
  redirectionUrl: string;
}

export class FetchKycDetailsDto {
  @ApiProperty({
    description: 'Transaction ID from generate-kyc-link response',
    example: 'TXN123456789',
    type: String,
  })
  @IsString({ message: 'Transaction ID must be a string' })
  @IsNotEmpty({ message: 'Transaction ID is required' })
  transactionId: string;
}
