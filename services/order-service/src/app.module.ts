import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { OrdersModule } from './orders/orders.module';
import { EventsModule } from './events/events.module';
import { KafkaProducerModule } from './kafka/kafka.producer.module';
import { KafkaConsumerModule } from './kafka/kafka.consumer.module';
import { AppController } from './app.controller';

@Module({
  imports: [DatabaseModule, EventsModule, KafkaProducerModule, OrdersModule, KafkaConsumerModule],
  controllers: [AppController],
})
export class AppModule {}
