import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PanVerificationService } from './pan-verification.service';
import { PanVerificationController } from './pan-verification.controller';
import { OcrModule } from '../ocr/ocr.module';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    OcrModule,
  ],
  controllers: [PanVerificationController],
  providers: [PanVerificationService],
  exports: [PanVerificationService],
})
export class PanVerificationModule {}
