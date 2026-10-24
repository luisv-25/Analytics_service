import { Controller, Get, UseGuards } from "@nestjs/common";
import { AnalyticsService } from "./analytics.service";
import { JwtRolesGuard } from "../common/jwt-roles.guard";
import { Roles } from "../common/roles.decorator";

// "Panel de Analítica" (encabezado de la sección 5.9): todos los
// endpoints son de solo lectura y restringidos a admin -- son métricas
// agregadas de toda la plataforma, no datos de un estudiante/tutor
// particular.
@Controller("analytics")
@UseGuards(JwtRolesGuard)
@Roles("admin")
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get("sessions-by-subject")
  sessionsBySubject() {
    return this.analyticsService.sessionsBySubject();
  }

  @Get("revenue-by-subject")
  revenueBySubject() {
    return this.analyticsService.revenueBySubject();
  }

  @Get("tutor-retention")
  tutorRetention() {
    return this.analyticsService.tutorRetentionRate();
  }

  @Get("trial-conversion")
  trialConversion() {
    return this.analyticsService.trialConversionRate();
  }

  // Los 4 KPIs juntos, para pintar el panel completo en una sola llamada
  // desde el frontend del admin.
  @Get("dashboard")
  dashboard() {
    return this.analyticsService.dashboard();
  }
}
