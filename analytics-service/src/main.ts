import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { Transport, MicroserviceOptions } from "@nestjs/microservices";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix("api/v1");

  const rabbitUrl = process.env.RABBITMQ_URL || "amqp://guest:guest@localhost:5672";

  // Analytics Service consume de TRES colas dedicadas distintas, una por
  // cada microservicio productor (patrón de colas dedicadas del proyecto:
  // el transporte RMQ de NestJS entrega cada mensaje a un único consumidor
  // de la cola a la que se publica, así que reutilizar una cola que ya
  // consume otro servicio le habría robado mensajes a ese servicio en vez
  // de darle a Analytics una copia propia). Las tres se registran con
  // connectMicroservice() antes de startAllMicroservices(); los
  // @EventPattern() de cada *.consumer.ts se conectan automáticamente a
  // las tres, pero como los nombres de evento no se repiten entre colas
  // (booking.confirmed/cancelled | session.completed | payment.succeeded)
  // no hay riesgo de que un consumidor reciba el evento equivocado.
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rabbitUrl],
      queue: "booking_analytics_queue",
      queueOptions: { durable: true },
    },
  });
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rabbitUrl],
      queue: "session_analytics_queue",
      queueOptions: { durable: true },
    },
  });
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rabbitUrl],
      queue: "payment_analytics_queue",
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
