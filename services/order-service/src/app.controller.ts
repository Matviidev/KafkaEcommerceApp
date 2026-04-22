import { Controller, Get, Res } from '@nestjs/common';
import { register } from 'prom-client';
import type { Response } from 'express';

@Controller()
export class AppController {
  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Get('metrics')
  async metrics(@Res() res: Response) {
    res.set('Content-Type', register.contentType);
    res.send(await register.metrics());
  }
}
