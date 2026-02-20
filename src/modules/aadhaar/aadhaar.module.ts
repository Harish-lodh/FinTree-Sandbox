import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AadhaarService } from './aadhaar.service';
import { AadhaarController } from './aadhaar.controller';

@Module({
  imports: [ConfigModule],
  controllers: [AadhaarController],
  providers: [AadhaarService],
  exports: [AadhaarService],
})
export class AadhaarModule {}
