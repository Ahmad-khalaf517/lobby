import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DevController } from './gateway/dev.controller';

@Module({
  imports: [],
  controllers: [AppController, DevController],
  providers: [AppService],
})
export class AppModule {}
