import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PanService } from './pan.service';
import { PanController } from './pan.controller';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
  ],
  controllers: [PanController],
  providers: [PanService],
  exports: [PanService],
})
export class PanModule {}
