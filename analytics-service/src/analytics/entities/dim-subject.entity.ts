import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

// dim_subject no aparece con su propia fila en la tabla de la sección 5.9,
// pero fact_bookings.dim_subject_id se declara explícitamente como FK
// "hacia tablas de dimensión locales" junto a dim_date_id y dim_tutor_id,
// así que se infiere esta tercera dimensión siguiendo el mismo patrón que
// dim_tutor (snapshot + referencia lógica), necesaria para el KPI
// "ingresos por materia" / "sesiones realizadas por materia".
@Entity("dim_subject")
export class DimSubject {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // Referencia LÓGICA a catalog_db.subjects.id (sección 5.10).
  @Index({ unique: true })
  @Column({ type: "uuid" })
  subject_id: string;

  // Snapshot de subjects.name / subjects.area (catalog-service, sección
  // 5.2), resuelto con una llamada síncrona de solo lectura a
  // GET /subjects al verla por primera vez. Null si Catalog Service no
  // respondió -- nunca un nombre inventado.
  @Column({ nullable: true })
  name: string | null;

  @Column({ nullable: true })
  area: string | null;
}
