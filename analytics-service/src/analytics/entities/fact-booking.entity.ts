import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { DimDate } from "./dim-date.entity";
import { DimTutor } from "./dim-tutor.entity";
import { DimSubject } from "./dim-subject.entity";

export enum FactBookingStatus {
  CONFIRMED = "confirmed",
  CANCELLED = "cancelled",
  COMPLETED = "completed",
}

// Sección 5.9 del documento: fact_bookings, tabla de hechos del star
// schema. Deliberadamente desnormalizada (no 3FN): cada fila guarda el
// amount/status/duration_minutes vigente, sin historial de cambios, para
// privilegiar velocidad de lectura agregada sobre ausencia de redundancia.
@Entity("fact_bookings")
@Check(`"status" IN ('confirmed','cancelled','completed')`)
export class FactBooking {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // No forma parte de las "columnas relevantes" listadas en la sección
  // 5.9, pero es necesaria como llave de upsert idempotente: booking.
  // confirmed, session.completed y payment.succeeded llegan en eventos
  // separados (y pueden reentregarse por RabbitMQ) y todos deben
  // actualizar la MISMA fila en vez de crear duplicados -- mismo criterio
  // de idempotencia que gateway_reference en Payment Service (sección 5.5).
  @Index({ unique: true })
  @Column({ type: "uuid" })
  booking_id: string;

  @Index()
  @ManyToOne(() => DimDate, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "dim_date_id" })
  dimDate: DimDate;

  @Column({ type: "uuid" })
  dim_date_id: string;

  @Index()
  @ManyToOne(() => DimTutor, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "dim_tutor_id" })
  dimTutor: DimTutor;

  @Column({ type: "uuid" })
  dim_tutor_id: string;

  @Index()
  @ManyToOne(() => DimSubject, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "dim_subject_id" })
  dimSubject: DimSubject | null;

  @Column({ type: "uuid", nullable: true })
  dim_subject_id: string | null;

  // Monto de la reserva: arranca como booking.price_snapshot al confirmar
  // y se reemplaza por transaction.amount real si llega payment.succeeded
  // (el cobro real puede diferir del snapshot si hubo descuento por
  // paquete de horas -- ver LEEME).
  @Column({ type: "numeric", precision: 10, scale: 2, default: 0 })
  amount: number;

  @Column({ type: "enum", enum: FactBookingStatus, default: FactBookingStatus.CONFIRMED })
  status: FactBookingStatus;

  // Duración real de la sesión en minutos, calculada por Session Service
  // entre la creación de la sala y el cierre de la llamada (ver LEEME:
  // Daily.co en el plan gratuito no expone telemetría de inicio real de
  // la llamada, así que es una aproximación documentada, nunca un valor
  // inventado). Null hasta que llega session.completed.
  @Column({ type: "int", nullable: true })
  duration_minutes: number | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
