import { Controller, Sse, type MessageEvent } from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Sse()
  stream(): Observable<MessageEvent> {
    return this.eventsService.stream$.pipe(
      map(({ type, data }) => ({ type, data: JSON.stringify(data) })),
    );
  }
}
