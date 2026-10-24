import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AnalyticsModule } from "./analytics/analytics.module";
import { EventsModule } from "./events/events.module";
import { DimDate } from "./analytics/entities/dim-date.entity";
import { DimTutor } from "./analytics/entities/dim-tutor.entity";
import { DimSubject } from "./analytics/entities/dim-subject.entity";
import { FactBooking } from "./analytics/entities/fact-booking.entity";
import { StudentFunnel } from "./analytics/entities/student-funnel.entity";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: "postgres",
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT) || 5439,
      username: process.env.DB_USER || "analytics_svc",
      password: process.env.DB_PASSWORD || "analytics_svc_pw",
      database: process.env.DB_NAME || "analytics_db",
      ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
      entities: [DimDate, DimTutor, DimSubject, FactBooking, StudentFunnel],
      // En Neon (producción) se usa DB_SYNCHRONIZE=false y se corre
      // analytics_db.sql a mano antes de cada redeploy (mismo orden que
      // el resto de microservicios): SQL primero en Neon, luego el código.
      synchronize: process.env.DB_SYNCHRONIZE !== "false",
    }),
    AnalyticsModule,
    EventsModule,
  ],
})
export class AppModule {}
