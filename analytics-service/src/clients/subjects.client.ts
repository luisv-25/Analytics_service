import { HttpService } from "@nestjs/axios";
import { Injectable, Logger } from "@nestjs/common";
import { firstValueFrom } from "rxjs";

interface CatalogSubject {
  id: string;
  name: string;
  area: string;
  level: string;
}

// Resuelve name/area de una materia contra Catalog Service, SOLO la
// primera vez que Analytics ve un subject_id nuevo. Catalog Service no
// expone GET /subjects/:id (solo GET /subjects, lista completa -- ver
// subjects.controller.ts), así que se trae la lista y se filtra en
// memoria; se cachea en memoria del proceso para no repetir la llamada en
// cada evento. Si SUBJECT_SERVICE_URL no está configurada o la llamada
// falla, devuelve null en vez de inventar un nombre.
@Injectable()
export class SubjectsClient {
  private readonly logger = new Logger(SubjectsClient.name);
  private readonly baseUrl = process.env.CATALOG_SERVICE_URL || "";
  private cache: CatalogSubject[] | null = null;
  private cacheLoadedAt = 0;
  private readonly cacheTtlMs = 5 * 60 * 1000;

  constructor(private readonly http: HttpService) {}

  async getSubject(subjectId: string): Promise<{ name: string; area: string } | null> {
    if (!this.baseUrl) {
      this.logger.warn("CATALOG_SERVICE_URL no configurada: dim_subject.name/area quedarán en null (modo simulado)");
      return null;
    }
    try {
      const list = await this.loadList();
      const found = list.find((s) => s.id === subjectId);
      return found ? { name: found.name, area: found.area } : null;
    } catch (err) {
      this.logger.warn(`No se pudo resolver la materia ${subjectId} contra Catalog Service: ${(err as Error).message}`);
      return null;
    }
  }

  private async loadList(): Promise<CatalogSubject[]> {
    const fresh = this.cache && Date.now() - this.cacheLoadedAt < this.cacheTtlMs;
    if (fresh) return this.cache as CatalogSubject[];
    const res = await firstValueFrom(
      this.http.get(`${this.baseUrl.replace(/\/$/, "")}/subjects`, { timeout: 5000 }),
    );
    this.cache = res.data ?? [];
    this.cacheLoadedAt = Date.now();
    return this.cache as CatalogSubject[];
  }
}
