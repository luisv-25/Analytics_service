import { Controller, Logger } from "@nestjs/common";
import { Ctx, EventPattern, Payload, RmqContext } from "@nestjs/microservices";
import { AnalyticsService } from "../analytics/analytics.service";

interface SessionCompletedEvent {
  eventName: string;
  occurredAt: string;
  data: { roomId: string; bookingId: string; durationMinutes: number | null };
}

// Consume session_analytics_queue (cola DEDICADA publicada por
// session-service -- ver LEEME.md). Mismo evento "session.completed" que
// ya consume booking-service, pero en una cola propia para no competir
// por los mensajes (patrón de colas dedicadas del proyecto).
@Controller()
export class SessionEventsConsumer {
  private readonly logger = new Logger(SessionEventsConsumer.name);

  constructor(private readonly analyticsService: AnalyticsService) {}

  @EventPattern("session.completed")
  async handleCompleted(@Payload() event: SessionCompletedEvent, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    try {
      await this.analyticsService.handleSessionCompleted(
        event.data.bookingId,
        event.data.durationMinutes ?? null,
      );
      channel.ack(originalMsg);
    } catch (err) {
      this.logger.error("Error procesando session.completed", err as Error);
      channel.nack(originalMsg, false, true);
    }
  }
}
