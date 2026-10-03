import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EsignService } from './esign.service';
import { EsignController } from './esign.controller';

@Module({
  imports: [ConfigModule],
  controllers: [EsignController],
  providers: [EsignService],
  exports: [EsignService],
})
export class EsignModule {}
