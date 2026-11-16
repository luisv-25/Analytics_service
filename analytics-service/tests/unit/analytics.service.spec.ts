import { AnalyticsService } from "../../src/analytics/analytics.service";
import { FactBookingStatus } from "../../src/analytics/entities/fact-booking.entity";

// Repositorio falso en memoria mínimo (findOne/create/save/count) para aislar la BD.
function repoFalso(filas: any[] = []) {
  return {
    filas,
    findOne: jest.fn(async ({ where }: any) => {
      const [k, v] = Object.entries(where)[0];
      return filas.find((f) => f[k] === v) ?? null;
    }),
    create: jest.fn((x: any) => ({ ...x })),
    save: jest.fn(async (x: any) => {
      if (!x.id) {
        x.id = `id-${filas.length + 1}`;
        filas.push(x);
      }
      return x;
    }),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
}

function crearServicio() {
  const repos = { date: repoFalso(), tutor: repoFalso(), subject: repoFalso(), fact: repoFalso(), funnel: repoFalso() };
  const users = { getFullName: jest.fn().mockResolvedValue("Tutora Ana") };
  const subjects = { getSubject: jest.fn().mockResolvedValue({ name: "Matemáticas", area: "Ciencias" }) };
  const service = new AnalyticsService(
    repos.date as any, repos.tutor as any, repos.subject as any, repos.fact as any, repos.funnel as any,
    users as any, subjects as any,
  );
  return { service, repos, users, subjects };
}

describe("AnalyticsService (unitarias, con mocks)", () => {
  it("Unitaria 1: booking.confirmed es idempotente, calcula dim_date y crea el embudo una sola vez", async () => {
    const { service, repos, users, subjects } = crearServicio();
    const evento = {
      bookingId: "b-1", studentId: "s-1", tutorId: "t-1", subjectId: "m-1",
      status: "confirmed", scheduledAt: "2026-05-14T15:00:00Z", priceSnapshot: 45,
    };

    await service.handleBookingConfirmed(evento);
    await service.handleBookingConfirmed({ ...evento, priceSnapshot: 50 }); // reentrega de RabbitMQ

    expect(repos.date.filas[0]).toMatchObject({ date: "2026-05-14", month: 5, quarter: 2, year: 2026 });
    expect(repos.fact.filas).toHaveLength(1); // misma fila, sin duplicados
    expect(repos.fact.filas[0]).toMatchObject({ booking_id: "b-1", status: FactBookingStatus.CONFIRMED, amount: 50 });
    expect(repos.funnel.filas).toHaveLength(1);
    expect(users.getFullName).toHaveBeenCalledTimes(1); // dimensiones ya existentes no se vuelven a pedir
    expect(subjects.getSubject).toHaveBeenCalledTimes(1);
  });

  it("Unitaria 2: KPIs de retención de tutores y conversión de prueba gratuita (incluye división entre cero)", async () => {
    const { service, repos } = crearServicio();
    const qb: any = {};
    for (const m of ["select", "addSelect", "where", "groupBy"]) qb[m] = jest.fn().mockReturnValue(qb);
    qb.getRawMany = jest.fn().mockResolvedValue([
      { dimTutorId: "a", completedSessions: "3" },
      { dimTutorId: "b", completedSessions: "1" },
      { dimTutorId: "c", completedSessions: "2" },
      { dimTutorId: "d", completedSessions: "1" },
    ]);
    repos.fact.createQueryBuilder.mockReturnValue(qb);

    expect(await service.tutorRetentionRate()).toEqual({
      totalTutorsConSesiones: 4, tutoresRetenidos: 2, tasaRetencion: 0.5,
    });

    repos.funnel.count.mockResolvedValueOnce(4).mockResolvedValueOnce(1);
    expect(await service.trialConversionRate()).toEqual({
      estudiantesConPruebaGratuita: 4, estudiantesConvertidos: 1, tasaConversion: 0.25,
    });

    repos.funnel.count.mockResolvedValue(0);
    expect((await service.trialConversionRate()).tasaConversion).toBe(0);
  });
});
