import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { HttpModule } from "@nestjs/axios";
import { AnalyticsService } from "./analytics.service";
import { AnalyticsController } from "./analytics.controller";
import { DimDate } from "./entities/dim-date.entity";
import { DimTutor } from "./entities/dim-tutor.entity";
import { DimSubject } from "./entities/dim-subject.entity";
import { FactBooking } from "./entities/fact-booking.entity";
import { StudentFunnel } from "./entities/student-funnel.entity";
import { UsersClient } from "../clients/users.client";
import { SubjectsClient } from "../clients/subjects.client";
import { JwtConfigModule } from "../common/jwt-config.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([DimDate, DimTutor, DimSubject, FactBooking, StudentFunnel]),
    HttpModule,
    JwtConfigModule,
  ],
  providers: [AnalyticsService, UsersClient, SubjectsClient],
  controllers: [AnalyticsController],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
