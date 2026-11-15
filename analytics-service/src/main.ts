import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { Transport, MicroserviceOptions } from "@nestjs/microservices";
import { AppModule } from "./app.module";
import { setupMetrics } from "./metrics";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  setupMetrics(app);
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix("api/v1");

  const rabbitUrl = process.env.RABBITMQ_URL || "amqp://guest:guest@localhost:5672";

  // Analytics consume de UNA sola cola (analytics_events_queue) con UNA sola
  // conexión a RabbitMQ. Los tres productores (booking, session y payment)
  // publican en esa misma cola con su propio cliente; eso respeta el patrón
  // de "cola dedicada por consumidor" porque Analytics es el único que la lee.
  // Antes eran 3 colas = 3 conexiones, y el plan gratis de CloudAMQP solo
  // permite 20 conexiones simultáneas. Los @EventPattern() de los 3
  // *.consumer.ts siguen igual: los nombres de evento no se repiten
  // (booking.confirmed/cancelled | session.completed | payment.succeeded).
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rabbitUrl],
      queue: "analytics_events_queue",
      queueOptions: { durable: true },
    },
  });

  await app.startAllMicroservices();

  const port = process.env.PORT || 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[analytics-service] listening on port ${port}`);
}
bootstrap();
