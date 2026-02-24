import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { GoogleVisionService } from './google-vision.service';
import { OcrService } from './ocr.service';
import { OcrController } from './ocr.controller';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    // Configure Multer for file uploads
    MulterModule.register({
      storage: diskStorage({
        destination: './uploads/cheques',
        filename: (req, file, callback) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          const filename = `cheque-${uniqueSuffix}${ext}`;
          callback(null, filename);
        },
      }),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max file size
      },
      // fileFilter: (req, file, callback) => {
      //   const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
      //   if (allowedMimeTypes.includes(file.mimetype)) {
      //     callback(null, true);
      //   } else {
      //     callback(new Error('Invalid file type. Only JPEG, PNG, JPG, and WebP images are allowed.'), false);
      //   }
      // },
    }),
  ],
  controllers: [OcrController],
  providers: [GoogleVisionService, OcrService],
  exports: [GoogleVisionService, OcrService],
})
export class OcrModule {}
