import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { HarController } from './har.controller';
import { HarService } from './har.service';

@Module({
  imports: [LlmModule],
  controllers: [HarController],
  providers: [HarService],
})
export class HarModule {}
