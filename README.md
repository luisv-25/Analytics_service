# analytics-service

Métricas agregadas de la plataforma (consumo de eventos).

Parte de **EduConecta** (plataforma de tutorías, arquitectura de microservicios). Stack: NestJS · TypeORM · PostgreSQL · RabbitMQ.

## Requisitos
- Node.js 20+
- PostgreSQL 14+ (local o Neon)
- RabbitMQ (CloudAMQP o local)

## Puesta en marcha
```bash
cd analytics-service
cp .env.example .env   # completar valores
npm install
npm run start:dev      # desarrollo
npm run build && npm start   # producción
```
El servicio escucha en `PORT` (por defecto 5439). Salud: `GET /health` y `GET /ready`; métricas: `GET /metrics`.

## Variables de entorno
Ver `.env.example`. Todos los servicios que validan JWT deben usar el **mismo** `JWT_SECRET` (y el gateway también).

## Endpoints
| Método | Ruta |
|---|---|
| GET | `/api/v1/analytics/sessions-by-subject` |
| GET | `/api/v1/analytics/revenue-by-subject` |
| GET | `/api/v1/analytics/tutor-retention` |
| GET | `/api/v1/analytics/trial-conversion` |
| GET | `/api/v1/analytics/dashboard` |

## Mensajería (RabbitMQ)
- Colas: `analytics_events_queue`
- Consume: `booking.cancelled`, `booking.confirmed`, `payment.succeeded`, `session.completed`

## Pruebas
```bash
npm run test:unit
npm run test:integration   # requiere PostgreSQL (TEST_DB_PASSWORD)
```
CI/CD: GitHub Actions (`.github/workflows/ci.yml` y `deploy.yml`, despliegue a Render por Deploy Hook).
