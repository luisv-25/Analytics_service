import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

// Tabla de apoyo NO listada en la sección 5.9: el documento pide el KPI
// "tasa de conversión de prueba gratuita a paquete pagado" pero el star
// schema dado (fact_bookings/dim_date/dim_tutor) no alcanza para
// calcularlo, porque es una métrica por ESTUDIANTE a través del tiempo
// (¿su primera reserva fue seguida, después, de la compra de un paquete?),
// no por sesión. Se interpreta "prueba gratuita" como la primera reserva
// confirmada de cada estudiante; "conversión" como que ese mismo
// estudiante luego aparezca en un payment.succeeded con package_id no
// nulo (compra de un paquete de horas). Interpretación del equipo, a
// falta de un campo explícito "es_prueba_gratuita" en Booking/Payment.
@Entity("student_funnel")
export class StudentFunnel {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // Referencia LÓGICA a user_db.users.id.
  @Index({ unique: true })
  @Column({ type: "uuid" })
  student_id: string;

  @Column({ type: "timestamptz" })
  first_booking_at: Date;

  @Column({ type: "boolean", default: false })
  converted_to_package: boolean;

  @Column({ type: "timestamptz", nullable: true })
  converted_at: Date | null;
}
