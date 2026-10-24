import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

// Sección 5.9 del documento: dim_tutor. Tabla de solo lectura para el
// resto del sistema -- se puebla EXCLUSIVAMENTE desde los consumidores de
// eventos de este microservicio (BookingEventsConsumer), nunca por un
// endpoint de escritura expuesto aquí.
@Entity("dim_tutor")
export class DimTutor {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // Referencia LÓGICA a user_db.users.id (sección 5.10 del documento):
  // nunca FK física cruzando bases.
  @Index({ unique: true })
  @Column({ type: "uuid" })
  tutor_id: string;

  // Snapshot del nombre del tutor al momento en que se vio por primera vez
  // en un evento booking.confirmed. Se intenta enriquecer con una llamada
  // síncrona de solo lectura a GET /users/:id (mismo patrón de resolución
  // usado en Content Service, sección 5.7); si User Service no responde,
  // queda en null en vez de inventar un nombre -- nunca se fabrica un dato
  // que parezca real pero no lo sea (mismo criterio que DailyClient/
  // GatewayClient/StorageClient en los microservicios anteriores).
  @Column({ nullable: true })
  display_name: string | null;
}
