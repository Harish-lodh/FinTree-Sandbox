import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { GoogleVisionService } from './google-vision.service';

@Module({
  imports: [HttpModule],
  providers: [GoogleVisionService],
  exports: [GoogleVisionService],
})
export class OcrModule {}
