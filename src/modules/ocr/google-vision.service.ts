import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import * as path from 'path';

@Injectable()
export class GoogleVisionService {
  private readonly logger = new Logger(GoogleVisionService.name);
  private readonly client: ImageAnnotatorClient;

  constructor(private readonly config: ConfigService) {
    // Use the service account credentials from the config file
    const keyFilename = path.join(process.cwd(), 'config', this.config.get<string>('GCLOUD_KEY_FILE') || 'gcloud-key.json');
    this.client = new ImageAnnotatorClient({ keyFilename });
  }

  /**
   * Extract text from an image using Google Vision API
   * @param imageBuffer - Buffer of the image file
   * @returns Array of text lines extracted from the image
   */
  async extractTextFromImage(imageBuffer: Buffer): Promise<string[]> {
    try {
      this.logger.debug('Calling Google Vision API with image buffer');

      const [result] = await this.client.textDetection(imageBuffer);
      const detections = result.textAnnotations;

      if (detections && detections.length > 0) {
        // The first annotation contains all the text, subsequent ones are individual elements
        const fullText = detections[0]?.description ?? '';
        
        // Split by newlines and filter empty lines
        const lines = fullText
          .split('\n')
          .map((line: string) => line.trim())
          .filter((line: string) => line.length > 0);

        this.logger.debug(`Google Vision extracted ${lines.length} lines`);
        return lines;
      }

      this.logger.warn('No text found in image');
      return [];
    } catch (error) {
      this.logger.error(`Google Vision API error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract text from image URL using Google Vision API
   * @param imageUrl - URL of the image
   * @returns Array of text lines extracted from the image
   */
  async extractTextFromImageUrl(imageUrl: string): Promise<string[]> {
    try {
      this.logger.debug(`Calling Google Vision API with URL: ${imageUrl}`);

      const [result] = await this.client.textDetection(imageUrl);
      const detections = result.textAnnotations;

      if (detections && detections.length > 0) {
        const fullText = detections[0]?.description ?? '';
        
        const lines = fullText
          .split('\n')
          .map((line: string) => line.trim())
          .filter((line: string) => line.length > 0);

        this.logger.debug(`Google Vision extracted ${lines.length} lines`);
        return lines;
      }

      this.logger.warn('No text found in image');
      return [];
    } catch (error) {
      this.logger.error(`Google Vision API error: ${error.message}`);
      throw error;
    }
  }
}
