import { HttpService } from "@nestjs/axios";
import { Injectable, Logger } from "@nestjs/common";
import { firstValueFrom } from "rxjs";

// Resuelve el nombre real de un tutor contra User Service, SOLO la
// primera vez que Analytics ve un tutor_id nuevo (para no repetir la
// llamada en cada evento, igual criterio que el snapshot de
// price_snapshot/full_name en los demás microservicios). Si
// USER_SERVICE_URL no está configurada o la llamada falla, devuelve null
// en vez de inventar un nombre -- mismo criterio "nunca fabricar un éxito
// que parezca real" que DailyClient/GatewayClient/StorageClient.
@Injectable()
export class UsersClient {
  private readonly logger = new Logger(UsersClient.name);
  private readonly baseUrl = process.env.USER_SERVICE_URL || "";

  constructor(private readonly http: HttpService) {}

  async getFullName(userId: string): Promise<string | null> {
    if (!this.baseUrl) {
      this.logger.warn("USER_SERVICE_URL no configurada: dim_tutor.display_name quedará en null (modo simulado)");
      return null;
    }
    try {
      const res = await firstValueFrom(
        this.http.get(`${this.baseUrl.replace(/\/$/, "")}/users/${userId}`, { timeout: 5000 }),
      );
      return res.data?.full_name ?? null;
    } catch (err) {
      this.logger.warn(`No se pudo resolver el nombre del usuario ${userId} contra User Service: ${(err as Error).message}`);
      return null;
    }
  }
}
