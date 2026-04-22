import { Module } from '@nestjs/common';
import { KafkaConsumerService } from './kafka.consumer.service';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [OrdersModule],
  providers: [KafkaConsumerService],
})
export class KafkaConsumerModule {}
