import {
  Controller,
  Post,
  Body,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { HarService } from './har.service';
import {
  AnalyzeHarDto,
  AnalyzeHarResponseDto,
  ExecuteRequestDto,
  ExecuteResponseDto,
  UploadHarResponseDto,
} from './dto/analyze-har.dto';

@Controller('har')
export class HarController {
  private readonly logger = new Logger(HarController.name);

  constructor(private readonly harService: HarService) {}

  /**
   * Upload a .har file for parsing and filtering.
   * Returns compact entry summaries and a storage ID for subsequent analysis.
   */
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 150 * 1024 * 1024 }, // 150MB max
      fileFilter: (_req, file, cb) => {
        if (
          !file.originalname.endsWith('.har') &&
          file.mimetype !== 'application/json'
        ) {
          return cb(
            new BadRequestException('Only .har files are allowed'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UploadHarResponseDto> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    this.logger.log(
      `Received HAR file: ${file.originalname} (${(file.size / 1024).toFixed(1)} KB)`,
    );

    const content = file.buffer.toString('utf-8');
    return this.harService.upload(content);
  }

  /**
   * Analyze a stored HAR file to find the best-matching API request.
   * Uses an LLM to identify the match and returns a curl command.
   */
  @Post('analyze')
  async analyze(@Body() dto: AnalyzeHarDto): Promise<AnalyzeHarResponseDto> {
    return this.harService.analyze(dto.harId, dto.description);
  }

  /**
   * Execute an HTTP request as a server-side proxy.
   * This avoids CORS issues when testing API calls from the browser.
   */
  @Post('execute')
  async execute(@Body() dto: ExecuteRequestDto): Promise<ExecuteResponseDto> {
    return this.harService.execute(dto);
  }
}
