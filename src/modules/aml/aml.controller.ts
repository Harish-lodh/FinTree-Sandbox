import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { AmlService } from './aml.service';
import { TrackwizzAmlVerificationDto } from './dto/trackwizz-aml.dto';

@ApiTags('AML')
@ApiSecurity('X-API-Key')
@Controller('aml')
export class AmlController {
  constructor(private readonly amlService: AmlService) {}

  @Post('trackwizz/verify')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Run TrackWizz AML screening' })
  @ApiBody({ type: TrackwizzAmlVerificationDto })
  @ApiResponse({ status: 200, description: 'AML screening completed' })
  @ApiResponse({ status: 400, description: 'Invalid AML screening payload' })
  @ApiResponse({ status: 500, description: 'TrackWizz configuration missing' })
  async verifyWithTrackwizz(@Body() dto: TrackwizzAmlVerificationDto) {
    return this.amlService.verifyWithTrackwizz(dto);
  }

  @Get('trackwizz/report/:requestId')
  @UseGuards(ApiKeyGuard)
  @SetMetadata('allowTrackwizzReportOpen', true)
  @SetMetadata('allowTrackwizzReportToken', true)
  @SetMetadata('skipResponseWrap', true)
  @ApiOperation({ summary: 'Open TrackWizz AML report PDF' })
  @ApiParam({
    name: 'requestId',
    example: 'LAN-EXAPM6423G-1788426813666',
  })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: 200, description: 'TrackWizz PDF report' })
  @ApiResponse({ status: 404, description: 'TrackWizz PDF report not found' })
  async openTrackwizzReport(
    @Param('requestId') requestId: string,
    @Res() response: Response,
  ) {
    const report = this.amlService.getTrackwizzReport(requestId);

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${report.fileName}"`,
    );

    return response.sendFile(report.filePath);
  }
}
