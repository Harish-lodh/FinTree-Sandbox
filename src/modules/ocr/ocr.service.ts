import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";
import FormData from "form-data";
import * as fs from "fs";

import { GoogleVisionService } from "./google-vision.service";
import { ChequeOcrDto, ChequeOcrResponse } from "./dto/cheque-ocr.dto";
import { PanOcrDto, PanOcrResponse } from "./dto/pan-ocr.dto";
import { parsePanText } from "../../utils/pan-parser.util";

// Multer file type
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
  path?: string;
}

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private readonly digitapBaseUrl: string;
  private readonly digitapClientId: string;
  private readonly digitapClientSecret: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly googleVisionService: GoogleVisionService,
    private readonly config: ConfigService,
  ) {
    this.digitapBaseUrl = this.config.get<string>("DIGITAP_BASE_URL")!;
    this.digitapClientId = this.config.get<string>("DIGITAP_CLIENT_ID")!;
    this.digitapClientSecret = this.config.get<string>(
      "DIGITAP_CLIENT_SECRET",
    )!;
  }

  /* ========================= CHEQUE OCR ========================= */

  async processCheque(dto: ChequeOcrDto): Promise<ChequeOcrResponse> {
    const { imageUrl, clientRefId, accountHolderName, isCompleteImage } = dto;
    console.log(imageUrl);
    if (!imageUrl || (!imageUrl.buffer && !imageUrl.path)) {
      throw new BadRequestException("Valid image file is required");
    }

    const normalizedIsCompleteImage =
      isCompleteImage === "yes" ||
      isCompleteImage === "true" ||
      isCompleteImage === true;

    let imageBuffer: Buffer;
    if (imageUrl.buffer) {
      imageBuffer = imageUrl.buffer;
    } else {
      imageBuffer = fs.readFileSync(imageUrl.path);
    }

    const mimeType = imageUrl.mimetype || "image/jpeg"; //alow for pdf allso

    // Validate image buffer is not empty and has minimum size
    if (!imageBuffer || imageBuffer.length < 100) {
      throw new BadRequestException("Invalid image: file is too small or empty");
    }

    // Validate image header to ensure it's actually an image
    const imageHeader = imageBuffer.slice(0, 8);
    const isValidImage = this.isValidImageBuffer(imageHeader, mimeType);
    if (!isValidImage) {
      this.logger.warn(`Invalid image buffer detected. MIME: ${mimeType}, Size: ${imageBuffer.length}`);
      throw new BadRequestException("Not a valid image file");
    }

    try {
      if (
        this.digitapBaseUrl &&
        this.digitapClientId &&
        this.digitapClientSecret
      ) {
        return await this.processChequeWithDigitap(
          imageBuffer,
          {
            clientRefId,
            accountHolderName,
            isCompleteImage: normalizedIsCompleteImage,
          },
          mimeType,
        );
      }

      this.logger.warn("Digitap not configured, using Google Vision fallback");
      return this.processChequeWithGoogleVision(imageBuffer);
    } catch (error: any) {
      this.logger.error("Cheque OCR failed", error?.message);
      throw new BadRequestException(error?.message || "Cheque OCR failed");
    }
  }

  private async processChequeWithDigitap(
    imageBuffer: Buffer,
    options: {
      clientRefId: string;
      accountHolderName?: string;
      isCompleteImage: boolean;
    },
    imageMimeType: string,
  ): Promise<ChequeOcrResponse> {
    try {
      const formData = new FormData();

      // Convert image buffer to base64 string as per Digitap API requirements
      // API accepts: public URL OR content OR Base64 encoded string
      const base64Image = imageBuffer.toString('base64');
      
      // Determine if it's PDF or image - use appropriate field name
      const isPdf = imageMimeType === 'application/pdf';
      
      if (isPdf) {
        formData.append('pdf', base64Image);
      } else {
        formData.append('imageUrl', base64Image);
      }

      formData.append('clientRefId', options.clientRefId);

      // ✅ MUST be yes / no
      formData.append(
        "isCompleteImage",
        options.isCompleteImage ? "yes" : "no",
      );

      if (options.accountHolderName) {
        formData.append("accountHolderName", options.accountHolderName);
      }

      const authString = Buffer.from(
        `${this.digitapClientId}:${this.digitapClientSecret}`,
      ).toString("base64");

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.digitapBaseUrl}/ocr/v1/cheque`,
          formData,
          {
            headers: {
              ...formData.getHeaders(),

              // ✅ EXACT AUTH HEADER - Basic auth with clientId:clientSecret
              Authorization: `Basic ${authString}`,
            },
            timeout: 60000,
          },
        ),
      );
      console.log("response-->", response);
      const data = response.data;

      // If Digitap returns status === 'failure', return the response directly as-is
      if (data?.status === "failure") {
        return {
          status: data.status,
          statusCode: Number(data.statusCode) || 400,
          error: data.error,
          ocrReqId: data.ocrReqId,
          clientRefId: data.clientRefId,
        };
      }

      return {
        status: data.status,
        statusCode: Number(data.statusCode),
        result: data.result,
      };
    } catch (error: any) {
      this.logger.error(
        "Digitap Cheque OCR error",
        error?.response?.data || error.message,
      );
      console.log(error.response);
      // If Digitap returned a response with status === 'failure', return it directly
      if (error?.response?.data?.status === "failure") {
        const data = error.response.data;
        return {
          status: data.status,
          statusCode: Number(data.statusCode) || 400,
          error: data.error,
          ocrReqId: data.ocrReqId,
          clientRefId: data.clientRefId,
        };
      }

      // Only throw BadRequestException for internal errors (network issues, timeouts, etc.)
      throw new BadRequestException(
        error?.response?.data || "Digitap Cheque OCR failed",
      );
    }
  }

  /* ========================= GOOGLE VISION FALLBACK ========================= */

  private async processChequeWithGoogleVision(
    imageBuffer: Buffer,
  ): Promise<ChequeOcrResponse> {
    const lines =
      await this.googleVisionService.extractTextFromImage(imageBuffer);

    const parsed = this.parseChequeText(lines);

    return {
      status: "success",
      statusCode: 200,
      result: [
        {
          type: "cheque",
          details: {
            account_number: { conf: 0.9, value: parsed.accountNumber || "" },
            ifsc_code: { conf: 0.9, value: parsed.ifscCode || "" },
            cheque_number: { conf: 0.9, value: parsed.chequeNumber || "" },
            date: { conf: 0.9, value: parsed.date || "" },
            amount: { conf: 0.9, value: parsed.amount || "" },
            payee_name: { conf: 0.9, value: parsed.payeeName || "" },
            bank_name: { conf: 0.9, value: parsed.bankName || "" },
          },
        },
      ],
    };
  }

  private parseChequeText(lines: string[]): any {
    const text = lines.join(" ").toUpperCase();
    const result: any = {};

    result.accountNumber = text.match(/\b\d{9,18}\b/)?.[0];
    result.ifscCode = text.match(/\b[A-Z]{4}\d{7}\b/)?.[0];
    result.chequeNumber = text.match(/\b\d{6,8}\b/)?.[0];
    result.date = text.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/)?.[0];
    result.amount = text.match(/₹\s*([\d,]+\.?\d*)/)?.[1];

    return result;
  }

  /**
   * Validate image buffer based on magic bytes
   */
  private isValidImageBuffer(header: Buffer, mimeType: string): boolean {
    // JPEG: FF D8 FF
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    // PDF: 25 50 44 46 (%
    // WebP: 52 49 46 46 ... 57 45 42 50 (RIFF....WEBP)
    // BMP: 42 4D (BM)
    // TIFF: 49 49 2A 00 or 4D 4D 00 2A

    if (mimeType === "application/pdf") {
      return header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46;
    }

    if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
      return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    }

    if (mimeType === "image/png") {
      return (
        header[0] === 0x89 &&
        header[1] === 0x50 &&
        header[2] === 0x4e &&
        header[3] === 0x47
      );
    }

    if (mimeType === "image/webp") {
      return (
        header[0] === 0x52 &&
        header[1] === 0x49 &&
        header[2] === 0x46 &&
        header[3] === 0x46 &&
        header[8] === 0x57 &&
        header[9] === 0x45 &&
        header[10] === 0x42 &&
        header[11] === 0x50
      );
    }

    if (mimeType === "image/bmp") {
      return header[0] === 0x42 && header[1] === 0x4d;
    }

    if (mimeType === "image/tiff") {
      return (
        (header[0] === 0x49 && header[1] === 0x49 && header[2] === 0x2a && header[3] === 0x00) ||
        (header[0] === 0x4d && header[1] === 0x4d && header[2] === 0x00 && header[3] === 0x2a)
      );
    }

    // For unknown types, do basic validation
    return header[0] !== 0x00 && header[1] !== 0x00;
  }

  /* ========================= PAN OCR ========================= */

  /* ========================= PAN OCR WITH FALLBACK ========================= */

  async ocrPan(file: MulterFile): Promise<any> {
    if (!file) throw new BadRequestException("PAN image file is required");

    let imageBuffer: Buffer;
    try {
      imageBuffer =
        file.buffer ??
        (file.path ? await fs.promises.readFile(file.path) : null);

      if (!imageBuffer) throw new Error("No buffer or path available");
    } catch (e) {
      this.logger.error(`Failed to read PAN image: ${e.message}`);
      throw new BadRequestException("Invalid or unreadable PAN image");
    }

    this.logger.debug(
      `OCR started | size: ${imageBuffer.length} | file: ${file.originalname}`,
    );

    /* ───────────── Finanalyz OCR (PRIMARY) ───────────── */

    this.logger.log("Attempting Finanalyz OCR...");

    const finanalyzOcrUrl = this.config.get<string>("FINANALYZ_OCR_URL");
    const finanalyzKey = this.config.get<string>("FINANALYZ_X_API_KEY");

    if (finanalyzOcrUrl && finanalyzKey) {
      const form = new FormData();
      form.append("file", imageBuffer, {
        filename: file.originalname || "pan.jpg",
        contentType: file.mimetype || "image/jpeg",
      });

      try {
        const { data } = await firstValueFrom(
          this.httpService.post(finanalyzOcrUrl, form, {
            headers: {
              ...form.getHeaders(),
              XApiKey: finanalyzKey,
              accept: "*/*",
            },
            validateStatus: () => true,
          }),
        );

        const pan = data?.data?.pan_number;

        if (pan) {
          this.logger.log(`Finanalyz OCR success → PAN: ${pan}`);
          return {
            provider: "FINANALYZ_OCR",
            success: true,
            data: {
              pan_number: pan,
              name: data.data.name || "",
              dob: data.data.dob || "",
              father_name: data.data.father_name || "",
            },
          };
        }

        this.logger.warn("Finanalyz OCR did not detect PAN");
      } catch (e) {
        this.logger.error(`Finanalyz OCR failed: ${e.message}`);
      }
    } else {
      this.logger.warn("Finanalyz OCR not configured, skipping");
    }

    /* ───────────── Google Vision OCR (FALLBACK) ───────────── */

    this.logger.log("Falling back to Google Vision OCR...");

    try {
      const lines =
        await this.googleVisionService.extractTextFromImage(imageBuffer);

      const fullText = lines.join("\n").trim();
      const isPaymentDoc = /payment|payments|paytm|upi/i.test(fullText);

      const { panNumber, name, dob, fatherName } = parsePanText(lines);

      if (panNumber && !isPaymentDoc) {
        this.logger.log(`Google Vision OCR success → PAN: ${panNumber}`);

        return {
          provider: "GOOGLE_VISION",
          success: true,
          data: {
            pan_number: panNumber,
            name: name || "",
            dob: dob || "",
            father_name: fatherName || "",
          },
        };
      }

      this.logger.warn("Google Vision OCR did not detect PAN");
    } catch (e) {
      this.logger.error(`Google Vision OCR failed: ${e.message}`);
    }

    /* ───────────── FINAL FAILURE ───────────── */

    return {
      provider: "NONE",
      success: false,
      message: "PAN could not be extracted from image",
      data: {
        pan_number: "",
        name: "",
        dob: "",
        father_name: "",
      },
    };
  }
}
