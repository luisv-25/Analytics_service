import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { DimDate } from "./entities/dim-date.entity";
import { DimTutor } from "./entities/dim-tutor.entity";
import { DimSubject } from "./entities/dim-subject.entity";
import { FactBooking, FactBookingStatus } from "./entities/fact-booking.entity";
import { StudentFunnel } from "./entities/student-funnel.entity";
import { UsersClient } from "../clients/users.client";
import { SubjectsClient } from "../clients/subjects.client";

interface BookingConfirmedData {
  bookingId: string;
  studentId: string;
  tutorId: string;
  subjectId: string | null;
  status: string;
  scheduledAt: string;
  priceSnapshot: number;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(DimDate) private readonly dimDateRepo: Repository<DimDate>,
    @InjectRepository(DimTutor) private readonly dimTutorRepo: Repository<DimTutor>,
    @InjectRepository(DimSubject) private readonly dimSubjectRepo: Repository<DimSubject>,
    @InjectRepository(FactBooking) private readonly factBookingRepo: Repository<FactBooking>,
    @InjectRepository(StudentFunnel) private readonly studentFunnelRepo: Repository<StudentFunnel>,
    private readonly usersClient: UsersClient,
    private readonly subjectsClient: SubjectsClient,
  ) {}

  // --- Dimensiones: solo lectura para el resto del sistema, se pueblan
  // exclusivamente desde aquí (consumidores de eventos), sección 5.9. ---

  private async upsertDimDate(isoDate: string): Promise<DimDate> {
    const date = isoDate.slice(0, 10); // YYYY-MM-DD
    const existing = await this.dimDateRepo.findOne({ where: { date } });
    if (existing) return existing;
    const d = new Date(`${date}T00:00:00Z`);
    const month = d.getUTCMonth() + 1;
    const quarter = Math.floor((month - 1) / 3) + 1;
    const year = d.getUTCFullYear();
    return this.dimDateRepo.save(this.dimDateRepo.create({ date, month, quarter, year }));
  }

  private async upsertDimTutor(tutorId: string): Promise<DimTutor> {
    const existing = await this.dimTutorRepo.findOne({ where: { tutor_id: tutorId } });
    if (existing) return existing;
    const displayName = await this.usersClient.getFullName(tutorId);
    return this.dimTutorRepo.save(
      this.dimTutorRepo.create({ tutor_id: tutorId, display_name: displayName }),
    );
  }

  private async upsertDimSubject(subjectId: string | null): Promise<DimSubject | null> {
    if (!subjectId) return null;
    const existing = await this.dimSubjectRepo.findOne({ where: { subject_id: subjectId } });
    if (existing) return existing;
    const info = await this.subjectsClient.getSubject(subjectId);
    return this.dimSubjectRepo.save(
      this.dimSubjectRepo.create({
        subject_id: subjectId,
        name: info?.name ?? null,
        area: info?.area ?? null,
      }),
    );
  }

  // --- Hechos ---

  // booking.confirmed: crea (o reactiva) la fila de fact_bookings.
  // Idempotente por booking_id (ver comentario en fact-booking.entity.ts).
  async handleBookingConfirmed(data: BookingConfirmedData) {
    const [dimDate, dimTutor, dimSubject] = await Promise.all([
      this.upsertDimDate(data.scheduledAt),
      this.upsertDimTutor(data.tutorId),
      this.upsertDimSubject(data.subjectId),
    ]);

    let fact = await this.factBookingRepo.findOne({ where: { booking_id: data.bookingId } });
    if (!fact) {
      fact = this.factBookingRepo.create({ booking_id: data.bookingId });
    }
    fact.dim_date_id = dimDate.id;
    fact.dim_tutor_id = dimTutor.id;
    fact.dim_subject_id = dimSubject ? dimSubject.id : null;
    fact.amount = data.priceSnapshot;
    fact.status = FactBookingStatus.CONFIRMED;
    await this.factBookingRepo.save(fact);

    // "Prueba gratuita" = primera reserva confirmada del estudiante (ver
    // student-funnel.entity.ts para la interpretación completa).
    const existingFunnel = await this.studentFunnelRepo.findOne({
      where: { student_id: data.studentId },
    });
    if (!existingFunnel) {
      await this.studentFunnelRepo.save(
        this.studentFunnelRepo.create({
          student_id: data.studentId,
          first_booking_at: new Date(data.scheduledAt),
        }),
      );
    }
    this.logger.log(`fact_bookings actualizada para booking ${data.bookingId} (confirmed)`);
  }

  async handleBookingCancelled(bookingId: string) {
    const fact = await this.factBookingRepo.findOne({ where: { booking_id: bookingId } });
    if (!fact) return; // nunca llegó booking.confirmed para esta reserva (p.ej. se canceló desde pending)
    fact.status = FactBookingStatus.CANCELLED;
    await this.factBookingRepo.save(fact);
    this.logger.log(`fact_bookings actualizada para booking ${bookingId} (cancelled)`);
  }

  // session.completed (con duration_minutes agregado -- ver LEEME.md):
  // marca la reserva como "completed" y registra cuánto duró la sesión.
  async handleSessionCompleted(bookingId: string, durationMinutes: number | null) {
    const fact = await this.factBookingRepo.findOne({ where: { booking_id: bookingId } });
    if (!fact) {
      this.logger.warn(`session.completed para booking ${bookingId} sin fact_bookings previo (evento fuera de orden); se ignora`);
      return;
    }
    fact.status = FactBookingStatus.COMPLETED;
    fact.duration_minutes = durationMinutes;
    await this.factBookingRepo.save(fact);
    this.logger.log(`fact_bookings actualizada para booking ${bookingId} (completed, ${durationMinutes ?? "?"} min)`);
  }

  // payment.succeeded: reemplaza el amount estimado (price_snapshot) por
  // el monto real cobrado, y -- si fue la compra de un paquete de horas
  // (packageId presente) -- marca la conversión en el embudo del estudiante.
  async handlePaymentSucceeded(data: {
    bookingId: string | null;
    packageId: string | null;
    studentId: string | null;
    amount: number;
  }) {
    if (data.bookingId) {
      const fact = await this.factBookingRepo.findOne({ where: { booking_id: data.bookingId } });
      if (fact) {
        fact.amount = data.amount;
        await this.factBookingRepo.save(fact);
      }
    }

    if (data.packageId && data.studentId) {
      let funnel = await this.studentFunnelRepo.findOne({ where: { student_id: data.studentId } });
      if (!funnel) {
        // Compró un paquete sin que hayamos visto antes una reserva suya
        // confirmada (p.ej. compró horas antes de agendar) -- se crea la
        // fila igual para no perder la conversión, con first_booking_at
        // igual a ahora como mejor aproximación disponible.
        funnel = this.studentFunnelRepo.create({
          student_id: data.studentId,
          first_booking_at: new Date(),
        });
      }
      if (!funnel.converted_to_package) {
        funnel.converted_to_package = true;
        funnel.converted_at = new Date();
      }
      await this.studentFunnelRepo.save(funnel);
      this.logger.log(`student_funnel: estudiante ${data.studentId} convertido a paquete pagado`);
    }
  }

  // --- KPIs (sección "Panel de Analítica" al inicio del documento) ---

  async sessionsBySubject() {
    const rows = await this.factBookingRepo
      .createQueryBuilder("f")
      .leftJoin("f.dimSubject", "s")
      .select("s.subject_id", "subjectId")
      .addSelect("s.name", "subjectName")
      .addSelect("COUNT(*)", "sessionsCompleted")
      .where("f.status = :status", { status: FactBookingStatus.COMPLETED })
      .groupBy("s.subject_id")
      .addGroupBy("s.name")
      .orderBy("COUNT(*)", "DESC")
      .getRawMany();
    return rows.map((r) => ({
      subjectId: r.subjectId,
      subjectName: r.subjectName ?? "Sin materia",
      sessionsCompleted: Number(r.sessionsCompleted),
    }));
  }

  async revenueBySubject() {
    const rows = await this.factBookingRepo
      .createQueryBuilder("f")
      .leftJoin("f.dimSubject", "s")
      .select("s.subject_id", "subjectId")
      .addSelect("s.name", "subjectName")
      .addSelect("SUM(f.amount)", "revenue")
      .where("f.status IN (:...statuses)", {
        statuses: [FactBookingStatus.CONFIRMED, FactBookingStatus.COMPLETED],
      })
      .groupBy("s.subject_id")
      .addGroupBy("s.name")
      .orderBy("SUM(f.amount)", "DESC")
      .getRawMany();
    return rows.map((r) => ({
      subjectId: r.subjectId,
      subjectName: r.subjectName ?? "Sin materia",
      revenue: Number(r.revenue ?? 0),
    }));
  }

  // Tasa de retención de tutores: interpretación del equipo (el documento
  // no define la fórmula exacta) -- % de tutores con al menos una sesión
  // completada que tienen 2 o más sesiones completadas en total (es decir,
  // que "repiten" en la plataforma en vez de dictar una sola sesión y no
  // volver a aparecer).
  async tutorRetentionRate() {
    const rows = await this.factBookingRepo
      .createQueryBuilder("f")
      .select("f.dim_tutor_id", "dimTutorId")
      .addSelect("COUNT(*)", "completedSessions")
      .where("f.status = :status", { status: FactBookingStatus.COMPLETED })
      .groupBy("f.dim_tutor_id")
      .getRawMany();

    const totalTutors = rows.length;
    const retainedTutors = rows.filter((r) => Number(r.completedSessions) >= 2).length;
    return {
      totalTutorsConSesiones: totalTutors,
      tutoresRetenidos: retainedTutors,
      tasaRetencion: totalTutors > 0 ? retainedTutors / totalTutors : 0,
    };
  }

  // Tasa de conversión de prueba gratuita a paquete pagado (ver
  // student-funnel.entity.ts para la definición exacta de "prueba
  // gratuita" y "conversión").
  async trialConversionRate() {
    const total = await this.studentFunnelRepo.count();
    const converted = await this.studentFunnelRepo.count({ where: { converted_to_package: true } });
    return {
      estudiantesConPruebaGratuita: total,
      estudiantesConvertidos: converted,
      tasaConversion: total > 0 ? converted / total : 0,
    };
  }

  async dashboard() {
    const [sessionsBySubject, revenueBySubject, tutorRetention, trialConversion] = await Promise.all([
      this.sessionsBySubject(),
      this.revenueBySubject(),
      this.tutorRetentionRate(),
      this.trialConversionRate(),
    ]);
    return { sessionsBySubject, revenueBySubject, tutorRetention, trialConversion };
  }
}
