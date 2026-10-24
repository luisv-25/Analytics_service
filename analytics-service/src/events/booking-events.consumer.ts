import { Controller, Logger } from "@nestjs/common";
import { Ctx, EventPattern, Payload, RmqContext } from "@nestjs/microservices";
import { AnalyticsService } from "../analytics/analytics.service";

interface BookingEvent {
  eventName: string;
  occurredAt: string;
  data: {
    bookingId: string;
    studentId: string;
    tutorId: string;
    subjectId: string | null;
    status: string;
    scheduledAt: string;
    priceSnapshot: number;
  };
}

// Consume booking_analytics_queue (cola DEDICADA publicada por
// booking-service -- ver LEEME.md). booking.created no se consume porque
// ningún KPI de la sección 5.9 lo necesita (solo booking.confirmed y
// booking.cancelled).
@Controller()
export class BookingEventsConsumer {
  private readonly logger = new Logger(BookingEventsConsumer.name);

  constructor(private readonly analyticsService: AnalyticsService) {}

  @EventPattern("booking.confirmed")
  async handleConfirmed(@Payload() event: BookingEvent, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    try {
      await this.analyticsService.handleBookingConfirmed(event.data);
      channel.ack(originalMsg);
    } catch (err) {
      this.logger.error("Error procesando booking.confirmed", err as Error);
      channel.nack(originalMsg, false, true);
    }
  }

  @EventPattern("booking.cancelled")
  async handleCancelled(@Payload() event: BookingEvent, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    try {
      await this.analyticsService.handleBookingCancelled(event.data.bookingId);
      channel.ack(originalMsg);
    } catch (err) {
      this.logger.error("Error procesando booking.cancelled", err as Error);
      channel.nack(originalMsg, false, true);
    }
  }
}
