import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { GstService } from './gst.service';
import { GstController } from './gst.controller';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
  ],
  controllers: [GstController],
  providers: [GstService],
  exports: [GstService],
})
export class GstModule {}
