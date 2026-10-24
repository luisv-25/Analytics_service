import { Module } from "@nestjs/common";
import { BookingEventsConsumer } from "./booking-events.consumer";
import { SessionEventsConsumer } from "./session-events.consumer";
import { PaymentEventsConsumer } from "./payment-events.consumer";
import { AnalyticsModule } from "../analytics/analytics.module";

// Analytics Service no publica eventos propios (es el extremo final de
// la cadena, sección 5.9: "se pueblan exclusivamente mediante los
// consumidores de eventos"), así que este módulo solo registra
// consumidores -- no hay ClientsModule.register() aquí.
@Module({
  imports: [AnalyticsModule],
  controllers: [BookingEventsConsumer, SessionEventsConsumer, PaymentEventsConsumer],
})
export class EventsModule {}
