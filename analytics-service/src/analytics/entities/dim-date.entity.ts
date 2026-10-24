import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

// Sección 5.9 del documento: dim_date, dimensión de tiempo del star schema.
// No tiene referencias lógicas a otra base porque es una dimensión
// puramente calculada a partir de la fecha de cada evento consumido
// (nunca se "pide prestada" de otro microservicio).
@Entity("dim_date")
export class DimDate {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // Una sola fila por día calendario (patrón star schema: todas las
  // fact_bookings de un mismo día apuntan a la misma fila de dim_date).
  @Index({ unique: true })
  @Column({ type: "date" })
  date: string;

  @Column({ type: "int" })
  month: number;

  @Column({ type: "int" })
  quarter: number;

  @Column({ type: "int" })
  year: number;
}
