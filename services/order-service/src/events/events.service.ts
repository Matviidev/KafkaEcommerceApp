import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';

export interface SsePayload {
  type: string;
  data: unknown;
}

@Injectable()
export class EventsService {
  private readonly subject = new Subject<SsePayload>();

  emit(type: string, data: unknown): void {
    this.subject.next({ type, data });
  }

  get stream$(): Observable<SsePayload> {
    return this.subject.asObservable();
  }
}
