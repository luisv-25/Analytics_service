import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../../src/app.module";
import { UsersClient } from "../../src/clients/users.client";
import { SubjectsClient } from "../../src/clients/subjects.client";
import { BookingEventsConsumer } from "../../src/events/booking-events.consumer";
import { SessionEventsConsumer } from "../../src/events/session-events.consumer";
import { PaymentEventsConsumer } from "../../src/events/payment-events.consumer";
import { createTestApp, tokenFor } from "../helpers/test-app";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [S1, S2, S3] = [uuid(1), uuid(2), uuid(3)]; // estudiantes
const [T1, T2, T3] = [uuid(11), uuid(12), uuid(13)]; // tutores
const [MATE, FISICA] = [uuid(21), uuid(22)]; // materias

// Clientes HTTP falsos (User y Catalog): sin red.
const usersFake = { getFullName: jest.fn(async (id: string) => `Tutor ${id.slice(-2)}`) };
const catalogoFake = {
  getSubject: jest.fn(async (id: string) =>
    id === MATE ? { name: "Matemáticas", area: "Ciencias" } : { name: "Física", area: "Ciencias" }),
};

// Contexto RabbitMQ falso para invocar los consumidores como lo haría el broker.
const ctx = () => ({ getChannelRef: () => ({ ack: jest.fn(), nack: jest.fn() }), getMessage: () => ({}) }) as any;

describe("Integración: panel de analítica (consumidores -> PostgreSQL -> KPIs solo admin)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp([AppModule], [
      { provide: UsersClient, useValue: usersFake },
      { provide: SubjectsClient, useValue: catalogoFake },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  it("puebla el esquema en estrella con eventos y expone los KPIs correctos solo al admin", async () => {
    const booking = app.get(BookingEventsConsumer);
    const session = app.get(SessionEventsConsumer);
    const payment = app.get(PaymentEventsConsumer);
    const reserva = (id: number, student: string, tutor: string, subject: string | null, price: number) =>
      booking.handleConfirmed(
        { eventName: "booking.confirmed", occurredAt: "", data: {
          bookingId: uuid(100 + id), studentId: student, tutorId: tutor, subjectId: subject,
          status: "confirmed", scheduledAt: "2026-03-10T10:00:00Z", priceSnapshot: price } },
        ctx(),
      );
    const completar = (id: number) =>
      session.handleCompleted({ eventName: "session.completed", occurredAt: "", data: { roomId: "r", bookingId: uuid(100 + id), durationMinutes: 60 } }, ctx());

    // Siembra: 5 reservas
    await reserva(1, S1, T1, MATE, 50);
    await reserva(2, S1, T1, MATE, 30);
    await reserva(3, S2, T2, FISICA, 20);
    await reserva(4, S2, T3, FISICA, 100);
    await reserva(5, S3, T2, null, 10);
    await completar(1);
    await completar(2);
    await completar(3);
    // La reserva 4 se cancela: no debe sumar ingresos ni sesiones
    await booking.handleCancelled({ eventName: "booking.cancelled", occurredAt: "", data: { bookingId: uuid(104) } } as any, ctx());
    // Pago real de la reserva 2 (40 en vez de 30) y compra de paquete del estudiante S1
    await payment.handleSucceeded(
      { eventName: "payment.succeeded", occurredAt: "", data: { transactionId: "x", bookingId: uuid(102), packageId: null, studentId: S1, tutorId: T1, amount: 40, tutorNetAmount: 36 } },
      ctx(),
    );
    await payment.handleSucceeded(
      { eventName: "payment.succeeded", occurredAt: "", data: { transactionId: "y", bookingId: null, packageId: uuid(900), studentId: S1, tutorId: null, amount: 200, tutorNetAmount: 0 } },
      ctx(),
    );

    const http = request(app.getHttpServer());
    const admin = { Authorization: `Bearer ${tokenFor("admin-1", "admin")}` };

    // Sesiones por materia: Matemáticas 2, Física 1 (solo completadas)
    const sesiones = await http.get("/api/v1/analytics/sessions-by-subject").set(admin).expect(200);
    expect(sesiones.body).toEqual([
      { subjectId: MATE, subjectName: "Matemáticas", sessionsCompleted: 2 },
      { subjectId: FISICA, subjectName: "Física", sessionsCompleted: 1 },
    ]);

    // Ingresos por materia: mate 50+40(real), física 20 (la cancelada de 100 no cuenta), sin materia 10
    const ingresos = await http.get("/api/v1/analytics/revenue-by-subject").set(admin).expect(200);
    expect(ingresos.body.map((r: any) => [r.subjectName, r.revenue])).toEqual([
      ["Matemáticas", 90], ["Física", 20], ["Sin materia", 10],
    ]);

    // Retención: T1 (2 sesiones) retenido, T2 (1) no -> 1/2
    const retencion = await http.get("/api/v1/analytics/tutor-retention").set(admin).expect(200);
    expect(retencion.body).toEqual({ totalTutorsConSesiones: 2, tutoresRetenidos: 1, tasaRetencion: 0.5 });

    // Conversión: 3 estudiantes con primera reserva, 1 compró paquete
    const conversion = await http.get("/api/v1/analytics/trial-conversion").set(admin).expect(200);
    expect(conversion.body.estudiantesConPruebaGratuita).toBe(3);
    expect(conversion.body.estudiantesConvertidos).toBe(1);
    expect(conversion.body.tasaConversion).toBeCloseTo(1 / 3);

    const dash = await http.get("/api/v1/analytics/dashboard").set(admin).expect(200);
    expect(Object.keys(dash.body)).toEqual(["sessionsBySubject", "revenueBySubject", "tutorRetention", "trialConversion"]);

    // Idempotencia: reentregar booking.confirmed no duplica ni cambia los KPIs
    await reserva(1, S1, T1, MATE, 50);
    const otra = await http.get("/api/v1/analytics/sessions-by-subject").set(admin).expect(200);
    expect(otra.body[0].sessionsCompleted).toBe(2);

    // Autorización: sin token 401; estudiante y tutor 403
    await http.get("/api/v1/analytics/dashboard").expect(401);
    await http.get("/api/v1/analytics/dashboard").set("Authorization", `Bearer ${tokenFor(S1, "student")}`).expect(403);
    await http.get("/api/v1/analytics/revenue-by-subject").set("Authorization", `Bearer ${tokenFor(T1, "tutor")}`).expect(403);

    // Los clientes se consultaron una vez por tutor/materia nuevo (no por cada evento)
    expect(usersFake.getFullName).toHaveBeenCalledTimes(3);
    expect(catalogoFake.getSubject).toHaveBeenCalledTimes(2);
  });
});
