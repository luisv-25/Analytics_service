import { Controller, Logger } from "@nestjs/common";
import { Ctx, EventPattern, Payload, RmqContext } from "@nestjs/microservices";
import { AnalyticsService } from "../analytics/analytics.service";

interface PaymentSucceededEvent {
  eventName: string;
  occurredAt: string;
  data: {
    transactionId: string;
    bookingId: string | null;
    packageId: string | null;
    studentId: string | null;
    tutorId: string | null;
    amount: number;
    tutorNetAmount: number;
  };
}

// Consume payment_analytics_queue (cola DEDICADA publicada por
// payment-service -- ver LEEME.md, incluye la corrección de una colisión
// de colas detectada en payment-service/src/events/events.module.ts).
// Solo payment.succeeded importa para los KPIs de la sección 5.9
// (ingresos reales y conversión a paquete pagado); payment.failed no
// afecta ningún KPI del panel y no se consume aquí.
@Controller()
export class PaymentEventsConsumer {
  private readonly logger = new Logger(PaymentEventsConsumer.name);

  constructor(private readonly analyticsService: AnalyticsService) {}

  @EventPattern("payment.succeeded")
  async handleSucceeded(@Payload() event: PaymentSucceededEvent, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    try {
      await this.analyticsService.handlePaymentSucceeded({
        bookingId: event.data.bookingId,
        packageId: event.data.packageId,
        studentId: event.data.studentId,
        amount: Number(event.data.amount),
      });
      channel.ack(originalMsg);
    } catch (err) {
      this.logger.error("Error procesando payment.succeeded", err as Error);
      channel.nack(originalMsg, false, true);
    }
  }
}
