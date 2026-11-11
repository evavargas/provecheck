# ProveCheck: documentación técnica completa de desarrollo

Documento maestro para desarrollo con Claude Code y para diseño de pantallas en Stitch.
Complementa a `provecheck-especificacion-tecnica.md` (stack, costos, publicación). Si hay conflicto entre ambos documentos, este es el que manda para funcionalidad y pantallas.

Cómo usar este documento:
- Claude Code: leer las secciones 1 a 12 (reglas, arquitectura, datos, API, procesos) y la sección 15 (plan de tareas). Las secciones 13 y 14 describen cada flujo y cada pantalla con su comportamiento exacto.
- Stitch: usar la sección 16 (sistema de diseño y prompts por pantalla). Cada prompt es autosuficiente.

Convenciones: la interfaz admite varios idiomas con i18n (RN-29); el idioma por defecto, y el de los textos de este documento, es el español rioplatense (voseo, "vos"). Zona horaria por defecto `America/Montevideo`, moneda UYU, formato de fecha `dd/mm/aaaa` y hora 24 h. Todo el código está en inglés (ver 5.7): identificadores (tablas, campos, valores de enums, endpoints), comentarios, tests y commits. Los identificadores se mantienen tal cual están escritos aquí; el español queda para los textos visibles al usuario y para este documento.

---

## 1. Objetivo

### 1.1 Qué es
ProveCheck es una app genérica para empresas proveedoras de servicios (limpieza, mantenimiento, control de plagas, etc.). Reemplaza el registro informal (WhatsApp, planillas, fotos sueltas) por un registro formal de tareas: se asigna la tarea a uno o más colaboradores, el colaborador registra su llegada, realiza el servicio, finaliza la tarea con evidencia (fotos y observaciones), el sistema genera un PDF y lo envía por mail al cliente, y el cliente puede presentar un descargo y calificar a los colaboradores desde la app.

### 1.2 Usuarios y plataformas
| Usuario | Plataforma | Objetivo principal |
|---|---|---|
| Administrador | Panel de gestión web responsive (React + Vite) | Operar todo: tareas, usuarios, empresas cliente, descargos, calificaciones |
| Colaborador | App móvil Android e iOS (Expo) y versión web responsive (misma app) | Ver sus tareas, registrar llegada, finalizar con evidencia, trabajar con mala señal |
| Usuario cliente | App móvil Android e iOS y versión web responsive (misma app Expo) | Ver tareas y PDF, presentar descargo, calificar colaboradores |

### 1.3 Criterios de éxito del MVP (testables)
1. Un administrador crea una tarea con 2 colaboradores en menos de 90 segundos.
2. Un colaborador sin conexión (app nativa) registra llegada y finaliza una tarea con 25 fotos; al recuperar señal todo sincroniza sin duplicados ni pérdida y sin intervención.
3. Al finalizar, el PDF se genera y el mail sale solo, en menos de 2 minutos con conexión normal.
4. Un usuario cliente ve exactamente las tareas que le corresponden por la regla 1 (visibilidad), verificado con tests de RLS.
5. Descargos y calificaciones se rechazan en el servidor pasado `objection_deadline_at`.
6. Un colaborador nunca recibe costos, importes ni calificaciones en ninguna respuesta de la API (test de contrato).
7. Cero registros editables después de finalizados (test de inmutabilidad).
8. Dos usuarios nunca comparten usuario o mail, y el mail de uno nunca coincide con el usuario de otro, ni al revés (test de unicidad cruzada, incluida concurrencia y mayúsculas).
9. Un usuario recién creado no puede usar la API salvo el primer ingreso hasta confirmar su mail y cambiar la contraseña.
10. Ninguna tarea se crea ni queda sin al menos un colaborador activo (test de API, RN-27).
11. Tema (claro, oscuro, sistema) e idioma se cambian al instante en el panel, la app y la versión web, se guardan en el perfil del usuario y no hay textos fijos en el código (verificación automática de claves de traducción, RN-29).

### 1.4 Fuera del MVP
Calendario, importación CSV, tests E2E completos, plantilla de PDF por empresa proveedora de servicios (todo eso es "versión completa", unas 210 horas más). Mover tareas entre empresas cliente a mano. Geolocalización. Firma del receptor. Liquidación o IVA. Mensajes pidiendo valoración. Notificaciones push y mails de aviso de cualquier tipo (el único mail es el del PDF al finalizar). Recuperación de contraseña por mail.

---

## 2. Terminología (glosario obligatorio)

Usar exactamente estos términos en código, textos de UI y documentos.

- **Empresa proveedora de servicios** (`organization`): la empresa que presta el servicio. Es el tenant.
- **Administrador**: usuario de la empresa proveedora que gestiona el panel.
- **Colaborador**: empleado de la empresa proveedora que realiza tareas.
- **Empresa cliente** (`client_company`): empresa que recibe el servicio.
- **Usuario cliente** (`client_user`): persona de contacto que accede a la app, asociada o no a una empresa cliente.
- **Tarea**: trabajo asignado a uno o más colaboradores (siempre al menos uno, RN-27) en una empresa cliente o para un usuario cliente.
- **Tarea finalizada**: tarea cuyo registro fue enviado por el colaborador.
- **Descargo**: observación o reclamo de un usuario cliente sobre una tarea finalizada.
- **Descargo realizado**: estado que toma la tarea cuando se presenta un descargo.
- **Registro** (`task_report`): contenido que carga el colaborador al finalizar (texto enriquecido y fotos).
- **Nombre de usuario** (`username`): identificador de acceso alternativo al mail.
- **Adjunto de descargo**: imagen que el usuario cliente agrega a su descargo.

### 2.1 Equivalencias con los identificadores de código
Los términos de este glosario son los textos visibles en español. En el código se usan siempre estos identificadores en inglés (5.7).

| Término (español) | Identificador |
|---|---|
| Empresa proveedora de servicios | `organization` |
| Administrador / Colaborador / Usuario cliente (roles) | `admin` / `collaborator` / `client_user` |
| Empresa cliente | `client_company` |
| Tarea | `task` |
| Registro | `task_report` |
| Descargo y adjunto de descargo | `objection`, `objection_attachment` |
| Calificación | `rating` |
| Tipo de servicio | `service_type` |
| Llegada | `arrival` (`arrived_at`) |
| Finalizar (acción) | `finalize`, que deja la tarea en `completed` |
| Demora en atender | `attendance_delayed` |
| Plazo de descargos | `objection_window_hours`, `objection_deadline_at` |

| Estado de la tarea (español) | Valor |
|---|---|
| Programada, En sitio, Finalizada | `scheduled`, `on_site`, `completed` |
| Descargo realizado, En gestión, Resuelta | `objection_filed`, `in_review`, `resolved` |
| Cancelada, Cerrada (derivado) | `cancelled`, `closed` |
| Estado del descargo: Abierto, En gestión, Resuelto | `open`, `in_review`, `resolved` |
| Envío de mail: Pendiente, Enviado, Fallido, Omitido sin contacto | `pending`, `sent`, `failed`, `skipped_no_contact` |

---

## 3. Reglas de negocio (numeradas, fuente de verdad)

Cada regla lleva un identificador `RN-n` para referenciar en tickets y tests.

- **RN-1 Visibilidad del usuario cliente.** Una tarea es visible para un usuario cliente si él figura en ella (`tasks.client_user_id`) o si la tarea pertenece a su empresa cliente actual (`tasks.client_company_id = users.client_company_id`). Se calcula al consultar (consulta y política RLS), nunca se copian datos. Si se lo desasocia de la empresa, pierde el acceso al historial de esa empresa, salvo tareas donde figura directamente.
- **RN-2 Destinatario obligatorio.** Toda tarea tiene `client_company_id` o `client_user_id` (o ambos). Restricción `CHECK` en base de datos.
- **RN-3 Tareas previas no migran.** Al asociar un usuario cliente a una empresa cliente, sus tareas anteriores conservan su vínculo original. No hay mover tareas a mano en el MVP.
- **RN-4 Destinatario del PDF (solo mail).** Orden: mail del usuario cliente de la tarea; si no tiene, mail de la empresa cliente de la tarea; si no hay, no se envía. Si el usuario cliente no tiene empresa cliente no hay alternativa. El resultado queda en `notifications_outbox` (`sent`, `failed`, `skipped_no_contact`). Los teléfonos son solo informativos.
- **RN-5 Envío automático.** Al finalizar, el backend encola generación de PDF y envío de mail. El colaborador no hace nada más.
- **RN-6 Plazo de descargos.** Configurable por empresa cliente (`objection_window_hours`, nullable). Por defecto 336 horas (14 días) tomado de `organizations.default_objection_window_hours`. Si la tarea es solo de un usuario cliente sin empresa, rige el default de la organización. Al finalizar, el servidor calcula y guarda `objection_deadline_at = corrected_completed_at + current_window`. Cambiar la configuración después no altera tareas ya finalizadas. Estado "cerrada" se deduce comparando con `now()`, sin job. Con tareas cerradas offline se corrige el desfase de reloj: `corrected_completed_at = received_at - (device_sent_at - device_completed_at)` (ver 10.4).
- **RN-7 Descargo único.** Un descargo por tarea (`objections.task_id` único). Puede llevar imágenes adjuntas (RN-21). No modifica el registro original. Pasa la tarea a `objection_filed` y aparece en el inicio del panel. Lo gestiona el administrador: `open`, `in_review`, `resolved`.
- **RN-8 Calificación.** El usuario cliente califica a cada colaborador de una tarea finalizada, solo desde la app, 1 a 5 estrellas, comentario opcional. Una calificación por colaborador por tarea, editable mientras `objection_deadline_at` no venció. Solo la ve el administrador (con promedio por colaborador). No se envía ningún pedido de valoración por mail ni push.
- **RN-9 Varios colaboradores.** Cada colaborador registra su propia llegada (`task_assignments.arrived_at`) y tiene su propio importe. El costo de la tarea es único. Hay un único registro por tarea: lo completa quien finaliza (cualquiera de los asignados activos; si dos intentan, gana el primero y el segundo recibe 409). Los demás lo ven en solo lectura.
- **RN-10 Registro inmutable.** Después de `completed` no se edita el registro. Mitigación: borrador autoguardado y pantalla de confirmación con resumen.
- **RN-11 Demora.** Booleano `attendance_delayed` por asignación. Sin minutos ni cálculo de horas trabajadas. Llegada y finalización son informativas.
- **RN-12 Sin geolocalización.** La dirección es texto. "Cómo llegar" abre un link de Google Maps con el texto de la dirección (`https://www.google.com/maps/search/?api=1&query=<url-encoded text>`), sin API. Se eliminan metadatos EXIF/GPS de las fotos en el dispositivo.
- **RN-13 Costos.** `cost_uyu` de tarea e `collaborator_fee_uyu` por asignación, en UYU, informativos, sin IVA ni liquidación. Solo los ve el administrador. Nunca viajan al colaborador ni al usuario cliente.
- **RN-14 Baja de colaborador.** Baja lógica (`status = inactive`). Si tiene tareas `scheduled` o `on_site`, el panel muestra alerta con lista y permite reasignar a otro colaborador activo, o crear uno en el momento. Con varios colaboradores solo se reemplaza su asignación (`active = false` y nueva asignación). Se invalidan sus sesiones. Un colaborador reemplazado deja de ser calificable en esa tarea. Nunca puede quedar una tarea sin colaborador activo (RN-27).
- **RN-15 Sin firma** del receptor. El campo `recipient_name` es texto opcional informativo.
- **RN-16 Retención.** Fotos originales y thumbnails se borran a los 180 días (el job diario `expire-photos` borra los archivos de Storage y marca `expired`). El PDF es permanente y lleva fotos embebidas reducidas (1024 px). La UI muestra "Foto expirada" en lugar de imagen rota.
- **RN-17 Contenido del registro.** Texto con negrita y bullets (nada más). Máximo 25 fotos por registro, validado en app y backend.
- **RN-18 Multitenencia.** Todas las tablas llevan `organization_id`; RLS aísla organizaciones. Un usuario pertenece a una sola organización.
- **RN-19 Auditoría.** Toda transición de estado y todo cambio sensible (costos, asignaciones, bajas, descargos, reenvíos) escribe en `audit_log`.
- **RN-20 Tarea cancelada.** El administrador puede cancelar una tarea en `scheduled` (no en `on_site` ni después). Una tarea cancelada no es visible como activa para el colaborador y es visible para el usuario cliente con la etiqueta "Cancelada". No genera PDF.
- **RN-21 Adjuntos del descargo.** El descargo admite hasta 5 imágenes, cada una comprimida en el dispositivo (lado largo 1600 px, JPEG 0,7, máximo 3 MB) y sin metadatos EXIF/GPS. Se suben antes de enviar el descargo y no se editan después. Retención de 180 días como las fotos del registro (RN-16); luego se muestra "Imagen expirada". Las ve el usuario cliente autor y el administrador.
- **RN-22 Qué ve el usuario cliente de su descargo.** Su texto, sus imágenes y el estado de gestión (abierto, en gestión, resuelto). Las notas internas del administrador (`internal_notes`) nunca viajan al cliente.
- **RN-23 Sin avisos automáticos.** En el MVP no hay push ni mails de aviso (ni de asignación, cancelación, descargo, invitación o recuperación). El único envío automático es el mail con el PDF al finalizar la tarea (RN-4, RN-5), más el reenvío manual del administrador. Los cambios se ven al abrir o refrescar la app o el panel.
- **RN-24 Alta y primer ingreso.** El administrador crea usuarios con nombre, usuario, mail, teléfono (todos obligatorios), rol y contraseña temporal. No se envía mail. En el primer ingreso el usuario debe confirmar su mail (puede corregirlo) y definir una contraseña nueva; hasta entonces la API solo permite el primer ingreso. El acceso es con usuario o mail, más contraseña.
- **RN-25 Unicidad de identificadores.** Los usuarios y los mails son únicos en todo el sistema (no por organización), sin distinguir mayúsculas. Además un mail no puede coincidir con el usuario de otra persona ni al revés. Se valida en el backend y se garantiza en base de datos con la tabla `user_identifiers` (clave primaria sobre el identificador). El nombre de usuario usa solo minúsculas, números, punto, guion y guion bajo (3 a 30 caracteres, sin "@").
- **RN-26 Contraseñas.** Mínimo 10 caracteres. Solo las guarda Supabase Auth. No hay "olvidé mi contraseña" por mail: la restablece el administrador asignando una temporal, lo que invalida sesiones y fuerza un nuevo primer ingreso.
- **RN-27 Toda tarea tiene al menos un colaborador.** Una tarea no se crea sin colaborador asignado ni puede quedar sin ningún colaborador activo: al crear se exige al menos uno; al reasignar o dar de baja se exige el reemplazo antes de confirmar. Se valida en la API dentro de la transacción (`EMPTY_ASSIGNMENT`, 422). Las tareas `cancelled` quedan exceptuadas.
- **RN-28 Sin imágenes de personas.** Los usuarios (administradores, colaboradores y usuarios cliente) no tienen foto ni avatar: la interfaz los muestra solo con su nombre. Las únicas imágenes que guarda el sistema son el logo de la empresa proveedora, las fotos de evidencia del registro (RN-16, RN-17) y los adjuntos de descargo (RN-21).
- **RN-29 Tema e idioma.** El panel, la app y la versión web ofrecen selector de tema (Claro, Oscuro, Sistema; por defecto Sistema, que sigue al dispositivo o navegador) y de idioma (español es-UY o inglés en). Se guardan en el perfil del usuario (`users.theme` y `users.locale`; `locale` nulo = idioma del dispositivo), así que lo acompañan entre dispositivos. Al iniciar sesión se aplican los valores del perfil; al cambiarlos se aplican al instante y se envían a `PATCH /me/preferences` (sin red, se reintenta al volver la conexión). En las pantallas sin sesión y durante el primer ingreso (M-04), cuando la API no admite esa llamada, la elección queda solo en el dispositivo y se sube al perfil al terminar el primer ingreso. El PDF y el mail del PDF usan el idioma por defecto de la organización (`organizations.default_locale`).
- **RN-30 Versión web del colaborador.** La versión web no tiene cola offline: registrar llegada, guardar el borrador y finalizar requieren conexión. Sin conexión se muestra 'Necesitás conexión para registrar llegada o finalizar' y esas acciones quedan bloqueadas. En web, la compresión de fotos y la eliminación de EXIF se hacen al re-codificar la imagen en el navegador. La app nativa conserva el funcionamiento sin conexión de la sección 10.

---

## 4. Roles y matriz de permisos

| Acción | Administrador | Colaborador | Usuario cliente |
|---|---|---|---|
| Alta/baja/modificación de usuarios y empresas cliente | Sí | No | No |
| Restablecer contraseña de un usuario (temporal) | Sí | No | No |
| Configurar plazo de descargos por empresa cliente | Sí | No | No |
| Crear, editar (antes de finalizar), reasignar, cancelar tareas | Sí | No | No |
| Ver todas las tareas de la organización | Sí | No | No |
| Ver sus tareas asignadas activas | n/a | Sí | n/a |
| Registrar llegada | No | Sí (si asignado activo) | No |
| Finalizar tarea con registro | No | Sí (si asignado activo) | No |
| Ver costos e importes | Sí | No | No |
| Ver PDF de la tarea | Sí | Sí (sus tareas finalizadas) | Sí (RN-1) |
| Reenviar PDF por mail | Sí | No | No |
| Presentar descargo | No | No | Sí (en plazo, RN-1) |
| Gestionar descargos | Sí | No | No |
| Calificar colaboradores | No | No | Sí (en plazo) |
| Ver calificaciones y promedios | Sí | No | Solo la propia (ver 14.3) |
| Gestionar tipos de servicio | Sí | No | No |
| Ver `audit_log` | Sí | No | No |

Aplicación: autorización en la API (middleware por rol) y RLS en Postgres como segunda barrera. Los controles de UI son solo UX.

---

## 5. Arquitectura

### 5.1 Componentes
```
[Expo app: collaborator + client user]  [React panel: admin]
            \                                   /
             \--------- HTTPS (JSON) ----------/
                          |
                  [API Fastify (Node 22)]
                  |        |         |
          [Postgres Supabase]  [Supabase Storage]  [pg-boss workers]
          (RLS, Auth)          (photos, PDF)      (PDF, PDF email, expiry)
                                                   |
                                       [Gmail SMTP: PDF email only]
```
- La app y el panel hablan solo con la API (excepto la subida de fotos y adjuntos directo a Storage con URL prefirmada). El login pasa por la API (`POST /auth/login`), que resuelve usuario o mail y usa Supabase Auth internamente.
- Workers pg-boss corren en el mismo servicio Node (proceso separado de arranque `worker`), mismo despliegue en Render.

### 5.2 Decisiones fijas
Sin Sentry y sin Google Maps API. Logs estructurados JSON (pino) revisados en el hosting. React Native (Expo) elegido sobre Flutter. PWA sola descartada.

### 5.3 Estructura del monorepo
```
provecheck/
  package.json            (pnpm workspaces)
  pnpm-workspace.yaml
  apps/
    mobile/               (Expo + Expo Router, TS)
      app/                (routes: (auth), (collab), (client))
      src/{components,features,db-local,sync,api,hooks,theme}
    panel/                (React + Vite + TanStack Query/Table + Tiptap)
      src/{routes,features,components,api,theme}
    api/                  (Fastify + zod + Drizzle)
      src/{modules,plugins,workers,db,lib}
      drizzle/            (SQL migrations)
  packages/
    shared/               (zod schemas, types, enums, typed API client, constants, i18n/{es,en}.json, theme tokens)
  docs/
    provecheck-documentacion-desarrollo.md
```

### 5.4 Comandos
```
Install:        pnpm install
Dev API:         pnpm --filter api dev            # tsx watch
Dev worker:      pnpm --filter api worker:dev
Dev panel:       pnpm --filter panel dev
Dev mobile:      pnpm --filter mobile start       # expo start (dev client)
Migrations:     pnpm --filter api db:generate && pnpm --filter api db:migrate
Unit tests:     pnpm -r test
API tests (db): pnpm --filter api test:integration
Lint/format:     pnpm -r lint && pnpm -r format
Typecheck:       pnpm -r typecheck
Build API:       pnpm --filter api build
Build panel:     pnpm --filter panel build
EAS dev build:   eas build --profile development --platform android
```

### 5.5 Estilo de código (ejemplo de referencia)
```ts
// apps/api/src/modules/tasks/finalize.ts
import { z } from 'zod';
import { finalizeInput } from '@provecheck/shared';

export async function finalizeTask(ctx: Ctx, input: z.infer<typeof finalizeInput>) {
  return ctx.db.transaction(async (tx) => {
    const task = await tx.tasks.lockById(input.taskId); // SELECT ... FOR UPDATE
    if (task.status === 'completed') return tx.tasks.toDto(task); // idempotent by client UUID
    assertAssigned(ctx.user, task);
    assertPhotosConfirmed(task, input.photoIds, { max: 25 });
    // ...
  });
}
```
Reglas: TypeScript estricto, `camelCase` en TS y `snake_case` en columnas, un módulo por dominio, zod en el borde (entrada y salida), nada de lógica de negocio en rutas (rutas llaman servicios), funciones pequeñas, errores tipados con códigos estables (ver 8.3).

### 5.6 Límites del trabajo
- **Siempre:** validar con zod en API, escribir test antes de la regla de negocio crítica, registrar en `audit_log`, usar transacciones para transiciones de estado, usar UUID generados en cliente para operaciones offline, escribir todo el código, comentarios, nombres de tests, commits y logs en inglés (5.7).
- **Preguntar antes:** cambiar esquema ya migrado en producción, agregar dependencias, cambiar CI, cambiar permisos por rol.
- **Nunca:** exponer costos al colaborador o cliente, editar registros finalizados, borrar físicamente usuarios o tareas, commitear secretos, guardar fotos con EXIF GPS, guardar fotos o avatares de personas, escribir textos de interfaz fijos en el código (siempre claves i18n), usar service role de Supabase desde el cliente.

### 5.7 Idioma del código
- Todo en inglés: código, identificadores (tablas, columnas, valores de enums, endpoints, parámetros, campos de DTO), comentarios, nombres de tests, mensajes de commit y de pull request, nombres de ramas, logs, migraciones, README, ADRs y `CLAUDE.md`.
- Español solo en los textos visibles al usuario, que viven en `packages/shared/i18n/es.json` (el inglés en `en.json`), y en este documento funcional. Las claves de traducción están en inglés (por ejemplo `tasks.list.empty`).
- Errores de la API: `code` estable en inglés. El `message` del servidor también va en inglés y es solo informativo; el cliente traduce por `code`.
- Los datos de ejemplo del seed pueden estar en español (nombres de empresas, calles); los campos y la estructura, en inglés.
- Las equivalencias entre los términos de negocio y los identificadores están en 2.1.

---

## 6. Modelo de datos (PostgreSQL)

### 6.1 Enums
```sql
CREATE TYPE user_role AS ENUM ('admin','collaborator','client_user');
CREATE TYPE user_status AS ENUM ('active','inactive','pending_first_login');
CREATE TYPE task_status AS ENUM ('scheduled','on_site','completed','objection_filed','in_review','resolved','cancelled');
CREATE TYPE photo_status AS ENUM ('uploading','uploaded','expired');
CREATE TYPE objection_status AS ENUM ('open','in_review','resolved');
CREATE TYPE outbox_channel AS ENUM ('email'); -- push is out of scope (RN-23)
CREATE TYPE outbox_status AS ENUM ('pending','sent','failed','skipped_no_contact');
```

### 6.2 Tablas (DDL de referencia)
```sql
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_key text,
  timezone text NOT NULL DEFAULT 'America/Montevideo',
  default_locale text NOT NULL DEFAULT 'es-UY' CHECK (default_locale IN ('es-UY','en')),
  default_objection_window_hours int NOT NULL DEFAULT 336 CHECK (default_objection_window_hours BETWEEN 1 AND 8760),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE client_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  legal_name text NOT NULL,
  address text,
  phone text,
  email text,
  contacts jsonb NOT NULL DEFAULT '[]',     -- [{name, job_title, phone, email}]
  notes text,
  objection_window_hours int CHECK (objection_window_hours BETWEEN 1 AND 8760),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, legal_name)
);

CREATE TABLE users (
  id uuid PRIMARY KEY,                         -- = Supabase auth.users.id
  organization_id uuid NOT NULL REFERENCES organizations(id),
  role user_role NOT NULL,
  name text NOT NULL,
  username citext NOT NULL,
  email citext NOT NULL,
  phone text NOT NULL,
  status user_status NOT NULL DEFAULT 'pending_first_login',
  must_change_password boolean NOT NULL DEFAULT true,
  theme text NOT NULL DEFAULT 'system' CHECK (theme IN ('light','dark','system')),
  locale text CHECK (locale IN ('es-UY','en')),   -- null = device language
  email_confirmed_at timestamptz,
  password_changed_at timestamptz,
  client_company_id uuid REFERENCES client_companies(id),   -- client_user role only
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (username ~ '^[a-z0-9._-]{3,30}$'),
  CHECK (client_company_id IS NULL OR role = 'client_user')
);
CREATE INDEX users_org_role_idx ON users (organization_id, role, status);

-- Global, cross-checked uniqueness of username and email (RN-25).
-- Each user inserts 2 rows (username and email) in the same transaction that creates users.
CREATE TABLE user_identifiers (
  identifier citext PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('username','email'))
);
CREATE UNIQUE INDEX one_identifier_kind_per_user ON user_identifiers (user_id, kind);
-- When the email changes (first login) the 'email' row is updated in the same transaction.
-- A deactivated user keeps its identifiers reserved.

CREATE TABLE service_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (organization_id, name)
);

CREATE TABLE tasks (
  id uuid PRIMARY KEY,                         -- generated by the client; stable
  organization_id uuid NOT NULL REFERENCES organizations(id),
  client_company_id uuid REFERENCES client_companies(id),
  client_user_id uuid REFERENCES users(id),
  address text NOT NULL,                     -- copied at creation
  recipient_name text,
  scheduled_start_at timestamptz NOT NULL,
  assigned_hours numeric(5,2),
  description text NOT NULL,
  instructions text,
  service_type_id uuid REFERENCES service_types(id),
  cost_uyu numeric(12,2) CHECK (cost_uyu >= 0),
  status task_status NOT NULL DEFAULT 'scheduled',
  completed_at timestamptz,                   -- corrected (server-equivalent time)
  received_at timestamptz,
  objection_deadline_at timestamptz,
  cancellation_reason text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (client_company_id IS NOT NULL OR client_user_id IS NOT NULL)
);
CREATE INDEX tasks_org_status_idx ON tasks (organization_id, status, scheduled_start_at);
CREATE INDEX tasks_company_idx ON tasks (client_company_id, completed_at DESC);
CREATE INDEX tasks_client_user_idx ON tasks (client_user_id, completed_at DESC);

CREATE TABLE task_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  task_id uuid NOT NULL REFERENCES tasks(id),
  collaborator_id uuid NOT NULL REFERENCES users(id),
  collaborator_fee_uyu numeric(12,2) CHECK (collaborator_fee_uyu >= 0),
  arrived_at timestamptz,
  device_arrived_at timestamptz,
  attendance_delayed boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  replaced_by uuid REFERENCES task_assignments(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_active_assignment ON task_assignments (task_id, collaborator_id) WHERE active;

CREATE TABLE task_reports (
  id uuid PRIMARY KEY,                         -- client-generated UUID (idempotency)
  organization_id uuid NOT NULL REFERENCES organizations(id),
  task_id uuid NOT NULL UNIQUE REFERENCES tasks(id),
  content_json jsonb NOT NULL,               -- restricted Tiptap document
  content_html text NOT NULL,                -- sanitized HTML
  completed_by uuid NOT NULL REFERENCES users(id),
  device_completed_at timestamptz NOT NULL,
  device_sent_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE task_report_drafts (              -- server-side autosaved draft (optional, best effort)
  task_id uuid NOT NULL REFERENCES tasks(id),
  collaborator_id uuid NOT NULL REFERENCES users(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  content_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, collaborator_id)
);

CREATE TABLE task_photos (
  id uuid PRIMARY KEY,                         -- client-generated UUID
  organization_id uuid NOT NULL REFERENCES organizations(id),
  task_id uuid NOT NULL REFERENCES tasks(id),
  uploaded_by uuid NOT NULL REFERENCES users(id),
  position smallint NOT NULL,
  original_key text NOT NULL,
  thumb_key text NOT NULL,
  pdf_key text NOT NULL,                       -- 1024 px version for the PDF
  bytes int,
  sha256 text,
  status photo_status NOT NULL DEFAULT 'uploading',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- limit of 25 per task: BEFORE INSERT trigger counting non-expired rows
CREATE INDEX photos_task_idx ON task_photos (task_id, position);
CREATE INDEX photos_expires_idx ON task_photos (expires_at) WHERE status <> 'expired';

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  task_id uuid NOT NULL REFERENCES tasks(id),
  pdf_key text NOT NULL,
  hash text NOT NULL,
  version int NOT NULL DEFAULT 1,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE objections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  task_id uuid NOT NULL UNIQUE REFERENCES tasks(id),
  author_id uuid NOT NULL REFERENCES users(id),
  description text NOT NULL CHECK (length(description) BETWEEN 5 AND 4000),
  status objection_status NOT NULL DEFAULT 'open',
  internal_notes text, -- admin only (RN-22)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE objection_attachments (
  id uuid PRIMARY KEY,                         -- client-generated UUID
  organization_id uuid NOT NULL REFERENCES organizations(id),
  task_id uuid NOT NULL REFERENCES tasks(id),
  staging_id uuid NOT NULL,                    -- batch generated by the app before creating the objection
  objection_id uuid REFERENCES objections(id),   -- filled in when the objection is created
  uploaded_by uuid NOT NULL REFERENCES users(id),
  position smallint NOT NULL,
  original_key text NOT NULL,
  thumb_key text NOT NULL,
  bytes int,
  sha256 text,
  status photo_status NOT NULL DEFAULT 'uploading',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX objection_att_idx ON objection_attachments (objection_id, position);
CREATE INDEX objection_att_staging_idx ON objection_attachments (staging_id);

CREATE TABLE task_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  task_assignment_id uuid NOT NULL REFERENCES task_assignments(id),
  author_id uuid NOT NULL REFERENCES users(id),
  stars smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment text CHECK (length(comment) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  UNIQUE (task_assignment_id, author_id)
);

CREATE TABLE notifications_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  task_id uuid REFERENCES tasks(id),
  channel outbox_channel NOT NULL,
  recipient text,                           -- resolved email address
  type text NOT NULL,                          -- only 'task_pdf' in the MVP (RN-23)
  status outbox_status NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL,
  actor_id uuid,
  entity text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_entity_idx ON audit_log (organization_id, entity, entity_id, created_at DESC);
```

### 6.3 Reglas en base de datos
- Trigger `task_reports_immutable`: `BEFORE UPDATE OR DELETE` en `task_reports` lanza excepción (registro inmutable).
- Trigger de tope de fotos: `BEFORE INSERT` en `task_photos` rechaza si ya hay 25 no expiradas para la tarea.
- Trigger `tasks_touch_updated_at`.
- Trigger de tope de adjuntos: `BEFORE INSERT` en `objection_attachments` rechaza si ya hay 5 con el mismo `staging_id`.
- Unicidad de identificadores: la clave primaria de `user_identifiers` es la garantía final; la API además pre-valida para devolver `IDENTIFIER_TAKEN` con el campo en conflicto.
- Trigger en `task_reports`: tras insertar, la API (no el trigger) mueve la tarea a `completed` dentro de la misma transacción.
- `objections`: insertar solo si `tasks.status = 'completed'` y `now() <= objection_deadline_at` (validado en API y reforzado por política RLS de INSERT).

### 6.4 Políticas RLS (esquema)
Habilitar RLS en todas las tablas. Función auxiliar `app.current_user_id()` y `app.current_org()` leídas de `request.jwt.claims` (la API establece `SET LOCAL` por transacción).
- Todas: `organization_id = app.current_org()`.
- `tasks` para `client_user`: `client_user_id = uid OR client_company_id = (SELECT client_company_id FROM users WHERE id = uid)`.
- `tasks` para `collaborator`: existe `task_assignments` activa con `collaborator_id = uid` (o inactiva si la tarea ya está finalizada y él trabajó en ella, para ver su historial).
- `task_assignments`, `task_ratings`, `cost_uyu`, `collaborator_fee_uyu`: lectura solo `admin`. Para colaborador y cliente la API usa vistas/DTO que excluyen esas columnas (defensa en profundidad: vista `tasks_public` sin costos).
- `objections`: administrador total; usuario cliente solo los de tareas que ve y que él autoró. `internal_notes` nunca viaja al cliente (DTO y vista sin esa columna). `objection_attachments` sigue el mismo alcance que su descargo.
- `task_ratings`: administrador lectura; usuario cliente CRUD solo propias dentro de plazo.

### 6.5 Migraciones y seed
Drizzle genera SQL; las políticas RLS, triggers y vistas se escriben en migraciones SQL manuales numeradas. Seed de desarrollo: 1 organización, 1 administrador, 3 colaboradores, 4 empresas cliente, 8 usuarios cliente, 20 tareas en todos los estados, 2 descargos, 5 calificaciones.

---

## 7. Máquina de estados de la tarea

```
scheduled --(first arrival)--> on_site --(complete)--> completed
scheduled --(admin cancels)--> cancelled
completed --(client files a objection, within the window)--> objection_filed
objection_filed --(admin)--> in_review --(admin)--> resolved
```
Notas:
- Permitido saltar de `scheduled` a `completed` si el colaborador finaliza sin haber registrado llegada: la API registra llegada implícita con la hora de finalización y marca `arrived_at = completed_at`. (La UI de colaborador exige llegada primero; este camino cubre sincronización offline desordenada.)
- `closed` es derivado: `status = 'completed' AND now() > objection_deadline_at` (no es valor del enum). Se muestra como "Cerrada".
- El estado de gestión del descargo (`objections.status`) y el de la tarea se mantienen sincronizados por el backend: `open` ↔ `objection_filed`, `in_review` ↔ `in_review`, `resolved` ↔ `resolved`.
- Toda transición la ejecuta el backend en transacción y escribe `audit_log`. El cliente nunca envía el estado destino; envía una acción.
- Transiciones inválidas devuelven 409 `INVALID_STATE_TRANSITION`.

---

## 8. API REST

Base `/v1`. JSON UTF-8. Autenticación `Authorization: Bearer <JWT Supabase>`. Fechas ISO 8601 UTC. Paginación por cursor: `?limit=25&cursor=...` con respuesta `{ items, nextCursor }`. Idempotencia: operaciones offline llevan UUID en el cuerpo o header `Idempotency-Key`.

### 8.1 Endpoints por módulo

**Auth y perfil**
- `POST /auth/login` : `{ identifier, password }` (usuario o mail, sin distinguir mayúsculas). Devuelve sesión y `mustChangePassword`. Error genérico `INVALID_CREDENTIALS` sin revelar si el usuario existe. Límite de 5 intentos por minuto por identificador y por IP.
- `POST /auth/first-login` : `{ email, newPassword }`. Solo con sesión que tenga `must_change_password`. Si `email` difiere del cargado, valida unicidad (RN-25) y lo actualiza. Marca `email_confirmed_at`, `must_change_password = false`, estado `active`.
- `POST /auth/change-password` : cambio voluntario `{ currentPassword, newPassword }`.
- `POST /auth/refresh` ; `POST /auth/logout`.
- `GET /me` : perfil, rol, organización, empresa cliente, `mustChangePassword`, `theme`, `locale`.
- `PATCH /me/preferences` : `{ theme?: 'light'|'dark'|'system', locale?: 'es-UY'|'en'|null }`. Disponible para los tres roles una vez terminado el primer ingreso (RN-29).
- Mientras `must_change_password` sea verdadero, la API rechaza todo salvo `/me`, `/auth/first-login` y `/auth/logout` con 403 `PASSWORD_CHANGE_REQUIRED`.

**Usuarios (administrador)**
- `GET /users?role=&status=&q=` ; `POST /users` (crea con nombre, usuario, mail, teléfono, rol y contraseña temporal; valida unicidad RN-25; no envía mail) ; `GET /users/availability?identifier=` (disponibilidad en vivo para el formulario) ; `GET /users/:id` ; `PATCH /users/:id` ; `POST /users/:id/deactivate` (baja lógica; si es colaborador devuelve lista de tareas pendientes en 409 `HAS_PENDING_TASKS` salvo `?force=false` flujo de reasignación) ; `POST /users/:id/reactivate` ; `POST /users/:id/reset-password` (el administrador define una temporal; invalida sesiones; fuerza nuevo primer ingreso).
- `PATCH /users/:id/client-company` : asociar/desasociar usuario cliente a empresa cliente.

**Empresas cliente (administrador)**
- `GET /client-companies?q=&active=` ; `POST` ; `GET /:id` ; `PATCH /:id` (incluye `objection_window_hours`) ; `POST /:id/deactivate`.

**Tipos de servicio (administrador)**
- `GET /service-types` ; `POST` ; `PATCH /:id`.

**Tareas**
- `GET /tasks` : filtros `status, clientCompanyId, collaboratorId, clientUserId, serviceTypeId, from, to, q, hasObjection`. Respuesta según rol (DTO distinto).
- `POST /tasks` (admin) : crea con asignaciones (al menos un colaborador, RN-27). Valida RN-2 y RN-27.
- `GET /tasks/:id` : detalle según rol.
- `PATCH /tasks/:id` (admin, solo `scheduled` o `on_site` para campos operativos; costos editables hasta finalizar).
- `POST /tasks/:id/cancel` (admin, solo `scheduled`, requiere motivo).
- `POST /tasks/:id/assignments` (admin) ; `POST /tasks/:id/assignments/:aid/replace` (admin, reasignación RN-14).
- `POST /tasks/:id/arrival` (colaborador) : `{ clientEventId, deviceArrivedAt, attendanceDelayed }`. Idempotente.
- `GET /tasks/:id/draft` / `PUT /tasks/:id/draft` (colaborador) : borrador servidor best effort.
- `POST /tasks/:id/photos/presign` (colaborador) : `{ photoId, position, bytes, sha256 }` devuelve 3 URLs prefirmadas PUT (original, thumb, pdf). Rechaza si excede 25.
- `POST /tasks/:id/photos/:photoId/confirm` : marca `uploaded` tras verificar existencia en Storage (HEAD).
- `POST /tasks/:id/finalize` (colaborador) : `{ reportId, contentJson, photoIds[], deviceCompletedAt, deviceSentAt }`. Idempotente por `reportId`. 409 `ALREADY_FINALIZED` si otro ya lo hizo (con el reporte existente en el cuerpo, para que la app muestre solo lectura).
- `GET /tasks/:id/report` : registro (HTML sanitizado) y fotos con URLs prefirmadas de lectura de corta vida.
- `GET /tasks/:id/pdf` : URL prefirmada de lectura del PDF vigente (404 `PDF_PENDING` si aún no está).
- `POST /tasks/:id/resend-pdf` (admin) : `{ recipientOverride? }` reencola mail; escribe auditoría.

**Descargos**
- `POST /tasks/:id/objection/attachments/presign` (usuario cliente) : `{ attachmentId, stagingId, position, bytes, sha256 }`. Devuelve URLs PUT (original y thumb). Rechaza fuera de plazo o si el lote ya tiene 5.
- `POST /tasks/:id/objection/attachments/:attachmentId/confirm` : verifica la existencia en Storage y marca `uploaded`.
- `POST /tasks/:id/objection` (usuario cliente) : `{ stagingId, description, attachmentIds[] }`. Valida plazo, estado, unicidad y que todos los adjuntos estén confirmados; vincula los adjuntos al descargo.
- `GET /objections?status=` (admin) ; `GET /objections/:id` ; `PATCH /objections/:id` (admin: `status`, `internalNotes`).

**Calificaciones**
- `GET /tasks/:id/ratings/mine` (cliente) ; `PUT /tasks/:id/ratings/:assignmentId` (cliente, crea o edita dentro de plazo).
- `GET /ratings?collaboratorId=&from=&to=` (admin) ; `GET /collaborators/:id/rating-summary` (admin: promedio, cantidad, distribución).

**Panel de inicio (admin)**
- `GET /dashboard/home` : `{ openObjections[], todayTasks[], onSiteTasks[], alerts[] }`.

**Auditoría y outbox (admin)**
- `GET /audit?entity=&entityId=` ; `GET /outbox?type=&status=&taskId=`.

**Salud**
- `GET /health` (sin auth).

### 8.2 DTO por rol (reglas de salida)
- `TaskAdminDto`: todo, incluye `costUyu`, `assignments[].collaboratorFeeUyu`, calificaciones agregadas.
- `TaskCollaboratorDto`: sin costos, sin importes, sin calificaciones. Incluye solo su asignación y los nombres de coasignados.
- `TaskClientDto`: sin costos ni importes. Incluye colaboradores (nombre, para calificar), `objectionDeadlineAt`, `canFileObjection`, `canRate`, estado derivado `closed`, y su `objection` (texto, adjuntos con URL de lectura, estado de gestión; sin `internalNotes`).
Test de contrato: serializar cada DTO y verificar con snapshot que no hay claves `cost*` ni `fee*` fuera del admin.

### 8.3 Errores (formato y códigos)
```json
{ "error": { "code": "OBJECTION_WINDOW_CLOSED", "message": "The objection window has closed.", "details": {} } }
```
Códigos: `UNAUTHORIZED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `VALIDATION_ERROR` 422, `INVALID_STATE_TRANSITION` 409, `ALREADY_FINALIZED` 409, `HAS_PENDING_TASKS` 409, `PHOTO_LIMIT_EXCEEDED` 422, `PHOTOS_NOT_CONFIRMED` 422, `OBJECTION_WINDOW_CLOSED` 403, `OBJECTION_ALREADY_EXISTS` 409, `RATING_WINDOW_CLOSED` 403, `RECIPIENT_REQUIRED` 422, `PDF_PENDING` 404, `RATE_LIMITED` 429, `IDENTIFIER_TAKEN` 409 (con `details.field` = username o email), `INVALID_CREDENTIALS` 401, `PASSWORD_CHANGE_REQUIRED` 403, `ATTACHMENT_LIMIT_EXCEEDED` 422, `EMPTY_ASSIGNMENT` 422 (RN-27). Los clientes traducen el texto por `error.code` (i18n); el `message` del servidor es solo informativo.

### 8.4 Seguridad de la API
Rate limit por IP y por usuario (`@fastify/rate-limit`). CORS restringido a dominios del panel y la web. Helmet. Validación estricta con zod (`.strict()`). Sanitización de HTML del registro con `sanitize-html` (solo `p, strong, ul, ol, li, br`). URLs prefirmadas de lectura con expiración de 10 minutos. Tamaño máximo por foto 3 MB tras compresión. Verificación `sha256` opcional. Logs sin datos personales (sin cuerpo de mails ni teléfonos). Contraseñas: mínimo 10 caracteres, guardadas solo por Supabase Auth (nunca en tablas propias ni en logs); la temporal que fija el administrador se muestra una sola vez en el panel.

---

## 9. Procesos asincrónicos (pg-boss)

| Cola | Disparador | Acción | Reintentos |
|---|---|---|---|
| `generate-pdf` | Finalización de tarea | Arma PDF con `@react-pdf/renderer`, sube a Storage, inserta `documents`, encola `send-pdf-mail` | 5, backoff exponencial |
| `send-pdf-mail` | Fin de `generate-pdf` o reenvío admin | Resuelve destinatario (RN-4), envía por Gmail SMTP (nodemailer) con PDF adjunto o link, escribe `notifications_outbox` | 5, backoff |
| `cleanup-attachments` | Cron diario | Borra adjuntos de descargo sin descargo asociado con más de 24 h | n/a |
| `expire-photos` | Cron diario 03:00 | Marca `expired` las fotos y adjuntos de descargo con `expires_at < now()` (además borra los objetos de Storage, que no tiene regla de ciclo de vida) | n/a |
| `db-keepalive` | Cron diario (solo plan Free) | Consulta trivial para evitar pausa | n/a |
| `backup-dump` | Cron nocturno GitHub Actions (plan Free) | `pg_dump` a Storage | n/a |

### 9.1 Contenido del mail del PDF
Asunto y cuerpo en el idioma por defecto de la organización (`organizations.default_locale`); lo que sigue es la versión en español.
Asunto: `Servicio realizado: {service_type} en {company_or_address} ({date})`. Cuerpo breve en español con resumen (fecha, colaboradores, tipo de servicio), botón "Ver en la app" y PDF adjunto si pesa menos de 10 MB (si no, solo link). Remitente con dominio verificado (SPF y DKIM). Pie con aviso de plazo de descargos con fecha límite exacta.

### 9.2 Notificaciones (fuera de alcance)
En el MVP no hay push ni mails de aviso (RN-23). El único envío automático es el mail con el PDF al finalizar la tarea (RN-4, RN-5). Los cambios se ven al abrir o refrescar la app o el panel. Se mantiene `notifications_outbox` con canal `email` para poder sumar canales después sin cambiar el modelo.

### 9.3 Estructura del PDF
Página A4 vertical, en el idioma por defecto de la organización (`organizations.default_locale`). Encabezado: logo de la empresa proveedora, nombre, título "Registro de servicio", número de tarea. Bloque de datos: empresa cliente o usuario cliente, dirección, tipo de servicio, persona que recibió (si existe), inicio pautado, llegada de cada colaborador, finalización (hora corregida), demora en atender (Sí/No por colaborador). Bloque "Colaboradores". Bloque "Descripción del servicio realizado" con el texto enriquecido (negrita y bullets). Bloque "Evidencia fotográfica" con grilla de 2 columnas, fotos de 1024 px con numeración. Pie: fecha de generación, plazo de descargos, hash corto del documento. No incluye costos ni importes ni calificaciones.

---

## 10. Conectividad pobre: sincronización offline (móvil)

### 10.1 Principios
Esta sección aplica a la app nativa; la versión web del colaborador requiere conexión (RN-30). La app nunca bloquea al colaborador por falta de red. Todo lo que el colaborador hace se guarda primero en SQLite local con UUID y se sincroniza con reintentos. Los endpoints son idempotentes por UUID.

### 10.2 Tablas locales (SQLite, `expo-sqlite`)
- `local_tasks` : copia de tareas asignadas (solo DTO de colaborador), con `synced_at`.
- `outbox_events` : cola de eventos `{ id UUID, type: 'arrival'|'photo_upload'|'finalize', payload JSON, status: 'pending'|'sending'|'error'|'ok', attempts, next_attempt_at, error }`.
- `local_photos` : `{ id UUID, task_id, position, uri_original, uri_thumb, uri_pdf, status: 'pending'|'uploading'|'confirmed'|'error', attempts }`.
- `local_drafts` : borrador del registro por tarea.

### 10.3 Algoritmo de sync
1. Disparadores: app en primer plano, cambio de conectividad (`NetInfo`), temporizador de 30 s con conexión, acción manual "Reintentar".
2. Procesar `outbox_events` en orden por tarea: `arrival` → fotos → `finalize`.
3. Fotos: una a una; pedir `presign`, subir con `PUT` a Storage (3 variantes), llamar `confirm`. Si falla, reintento con backoff `2^n` s hasta 60 s máximo, indefinido mientras la app viva.
4. `finalize` solo se envía cuando todas las fotos de ese registro están `confirmed`. Hasta entonces la tarea se muestra "Guardada en el teléfono, enviando 7/12".
5. Respuestas: 200/201/409 `ALREADY_FINALIZED` marcan el evento como `ok`; en `ALREADY_FINALIZED` se descarga el registro existente y se muestra solo lectura con aviso "Otro colaborador ya finalizó esta tarea".
6. Errores 4xx de validación (no recuperables) marcan `error` y muestran aviso accionable; 5xx y red reintentan.

### 10.4 Reloj del dispositivo
Cada evento guarda `device_*_at` (hora del teléfono) y, al enviar, `device_sent_at`. El servidor calcula el desfase `delta = received_at(server) - device_sent_at` y deriva la hora corregida: `corrected_event = device_event + delta`. Si `|delta|` supera 24 horas se marca `suspicious_clock` en auditoría. Se guardan ambas horas siempre.

### 10.5 Compresión de fotos (en dispositivo)
Lado largo 1600 px, JPEG calidad 0,7 (original almacenado), thumbnail 320 px, variante para PDF 1024 px. Eliminar EXIF/GPS (re-codificar con `expo-image-manipulator`). Orden = orden de selección, reordenable antes de finalizar.

### 10.6 Borradores
Autoguardado local cada 2 segundos de inactividad y al salir del editor. Sincronización al servidor (`PUT /draft`) cuando hay conexión, best effort, para recuperar si se pierde el teléfono. Al finalizar se borra el borrador.

---

## 11. Almacenamiento (Supabase Storage)

Claves: `org/{orgId}/tasks/{taskId}/photos/{photoId}/{original|thumb|pdf}.jpg` y `org/{orgId}/tasks/{taskId}/pdf/v{n}.pdf`. Bucket privado, solo URLs prefirmadas. Adjuntos de descargo: `org/{orgId}/tasks/{taskId}/objection/{attachmentId}/{original|thumb}.jpg`, con la misma retención de 180 días. Regla de ciclo de vida: prefijo `photos/` expira a 180 días; el prefijo `pdf/` no expira. Lectura de fotos por la app con URL prefirmada de 10 minutos pedida a la API; la API responde `status: 'expired'` si corresponde.

---

## 12. Requerimientos no funcionales

- Rendimiento: listados con paginación por cursor; p95 de API menor a 400 ms en consultas de lista con 10.000 tareas; panel carga el inicio en menos de 2 s en 4G.
- Disponibilidad: backend siempre encendido (Render Starter). Healthcheck en `/health`.
- Seguridad: HTTPS, RLS, auditoría, tokens JWT de Supabase con expiración, invalidación de sesiones al dar de baja, sin secretos en el repositorio, variables de entorno en Render y EAS secrets.
- Accesibilidad: contraste AA en ambos temas, objetivos táctiles de 48 px (mínimo 44 px), etiquetas accesibles, soporte de tamaño de texto del sistema.
- Responsive: panel, app y versión web se adaptan a móvil (360 a 767 px), tableta (768 a 1199 px) y escritorio (1200 px o más); ver 16.1 y 16.9.
- Temas: claro, oscuro y sistema en panel, app y web. Tokens de color compartidos en `packages/shared` con la paleta de 16.1; por defecto Sistema; cambio al instante y guardado en el perfil del usuario (RN-29). Contraste AA en ambos temas.
- Internacionalización (i18n): toda la interfaz (panel, app y versión web) usa i18next (`react-i18next`; en la app, `expo-localization` para detectar el idioma del dispositivo). Los textos viven por clave en `packages/shared/i18n/{es,en}.json`, sin cadenas fijas en el código. Idioma por defecto es-UY, selector de idioma en el perfil, en el menú de usuario del panel y en las pantallas sin sesión, con cambio al instante. Fechas, horas y montos se formatean con `Intl` según el idioma y la zona horaria de la organización. Los diseños toleran textos hasta un 40 % más largos. Idiomas del MVP: español (es-UY) e inglés (en); agregar un idioma = agregar un archivo de traducción. La elección se guarda en el perfil del usuario (RN-29).
- Privacidad: política pública, retención de fotos 180 días, revisión legal Ley 18.331 y URCDP. Sin geolocalización.
- Observabilidad: logs pino JSON con `requestId`, `userId`, `orgId`; métricas básicas de colas (pg-boss) en el panel de administración técnica opcional.
- Tests: unidad (Vitest) para reglas puras (plazo, destinatario, transiciones); integración API con Postgres real (Testcontainers) incluyendo RLS; contrato de DTO; pruebas de sync offline con simulación de red; E2E del flujo crítico en la versión completa.

---

## 13. Flujos funcionales (paso a paso)

### F1. Alta de organización y primer administrador
1. Se crea la organización y el primer administrador por script de seed o consola (no hay registro público).
2. El script de seed define usuario, mail, teléfono y una contraseña temporal; en su primer ingreso al panel el administrador confirma su mail y cambia la contraseña (mismo flujo que F2, sin mail).
3. Completa en Configuración: nombre, logo, zona horaria, idioma por defecto y plazo de descargos por defecto (336 h).

### F2. Alta de usuario y primer ingreso
1. Administrador: Usuarios > "Nuevo usuario". Campos obligatorios: nombre, usuario, mail, teléfono, rol y contraseña temporal (con botón "Generar"). Si es usuario cliente, opcionalmente empresa cliente.
2. El backend valida formato y unicidad global (RN-25), crea la cuenta en Supabase Auth con la contraseña temporal (API de administración, solo desde el backend) y crea `users` en estado `pending_first_login` con `must_change_password = true`, más las dos filas de `user_identifiers`, todo en una transacción. No se envía ningún mail. El panel muestra la contraseña temporal una sola vez para que el administrador se la entregue al usuario.
3. Primer ingreso: el usuario entra en la app o la web con usuario o mail y la contraseña temporal (M-01) y pasa a la pantalla obligatoria M-04. Confirma su mail (precargado, puede corregirlo; si lo cambia se revalida la unicidad) y define una contraseña nueva distinta de la temporal. Al guardar: `email_confirmed_at = now()`, `must_change_password = false`, estado `active`.
4. Hasta completar M-04 la API rechaza todo salvo `/me`, `/auth/first-login` y `/auth/logout` (403 `PASSWORD_CHANGE_REQUIRED`).
5. Olvido de contraseña: lo resuelve el administrador (Usuarios > "Restablecer contraseña"), que define una temporal nueva; se invalidan las sesiones y el usuario repite el paso 3.
6. Errores: usuario o mail en uso (409 `IDENTIFIER_TAKEN`, indicando el campo), usuario con formato inválido (422), mail inválido (422), contraseña débil (422).

### F3. Alta de empresa cliente
1. Administrador: Empresas cliente > "Nueva empresa". Razón social (obligatoria), dirección, teléfono, email, contactos (lista), observaciones, plazo de descargos (opcional, vacío = default).
2. Al guardar se audita. El mail de la empresa es el fallback del PDF (RN-4).

### F4. Crear tarea (administrador)
1. Tareas > "Nueva tarea".
2. Destinatario: elegir empresa cliente, usuario cliente o ambos (al menos uno, RN-2). Si elige empresa, la dirección se pre-llena con la de la empresa (editable); si es solo usuario cliente, se escribe la dirección.
3. Completar: inicio pautado (fecha y hora), horas asignadas (opcional), tipo de servicio (opcional), descripción (obligatoria), indicaciones para el colaborador (opcional), persona que recibe (opcional), costo UYU (opcional).
4. Asignar colaboradores activos (uno o más), con importe UYU opcional por cada uno.
5. Guardar: se crea `tasks` en `scheduled` y `task_assignments`. Auditoría. Sin notificaciones: el colaborador la ve al abrir o refrescar la app (RN-23).
6. Validaciones: inicio pautado válido, descripción no vacía, al menos un colaborador (regla confirmada: toda tarea se crea con al menos un colaborador), montos no negativos.

### F5. Colaborador ve y prepara su día
1. Abre la app: lista "Hoy" y "Próximas" de tareas `scheduled` y `on_site` asignadas, ordenadas por inicio pautado. La lista funciona sin conexión con la última copia local.
2. Toca una tarea: detalle con datos, indicaciones, botón "Cómo llegar" (link a Google Maps), teléfono de contacto de la empresa (informativo, con acción de llamar).

### F6. Registrar llegada
1. En el detalle de una tarea `scheduled`, botón "Registrar llegada".
2. Pregunta única: "¿Hubo demora en atenderte?" (Sí/No) para `attendance_delayed`.
3. Se guarda local con UUID y hora del dispositivo; se sincroniza. La tarea pasa a `on_site` al primer colaborador que llega. Cada colaborador registra la suya.
4. Si la tarea fue cancelada o reasignada mientras tanto, el servidor responde 409 y la app informa y vuelve a la lista.

### F7. Redactar registro y fotos
1. En `on_site`, botón "Finalizar tarea" abre el editor del registro: texto enriquecido (negrita, bullets) y galería.
2. Agregar fotos desde cámara o galería (hasta 25). Se comprimen y se limpian metadatos. Se pueden reordenar y eliminar antes de finalizar.
3. Autoguardado continuo del borrador.

### F8. Confirmar y finalizar
1. Botón "Revisar y finalizar" muestra el resumen: texto, fotos, hora de llegada, demora.
2. Aviso explícito: "Después de finalizar no vas a poder editar el registro."
3. Confirmar: crea el evento `finalize` en la cola local. La app muestra "Guardado en el teléfono, enviando N/M" y deja trabajar con otra tarea.
4. Con sincronización completa: servidor valida, crea `task_reports`, pasa a `completed`, calcula `objection_deadline_at` (RN-6), encola PDF.
5. Si otro colaborador ganó la carrera: la app recibe `ALREADY_FINALIZED` y muestra el registro ajeno en solo lectura.

### F9. Generación y envío del PDF
1. Worker `generate-pdf` arma y sube el PDF; `documents` queda insertado.
2. Worker `send-pdf-mail` resuelve destinatario (RN-4). Sin contacto: `skipped_no_contact`, y se muestra una alerta en el panel de la tarea.
3. Fallos: reintentos con backoff; al agotarse queda `failed` y el administrador puede "Reenviar PDF".

### F10. Usuario cliente consulta una tarea
1. Entra a la app o web. Lista de tareas visibles (RN-1) con filtros por estado y fecha.
2. Detalle de tarea finalizada: datos, colaboradores, registro, fotos (o "Foto expirada"), botón "Ver PDF", y acciones "Presentar descargo" y "Calificar" si el plazo está abierto, con cuenta regresiva de plazo.

### F11. Presentar descargo
1. En la tarea, "Presentar descargo": texto obligatorio (5 a 4000 caracteres) y hasta 5 imágenes opcionales (cámara o galería), comprimidas en el dispositivo y sin metadatos EXIF/GPS (RN-21).
2. La app genera un `stagingId`, pide URL prefirmada por imagen (`POST /tasks/:id/objection/attachments/presign`), sube cada una a Storage y la confirma.
3. Al enviar (`POST /tasks/:id/objection` con `stagingId`, `description`, `attachmentIds`), el backend valida estado `completed`, plazo, unicidad y que todos los adjuntos estén confirmados. Crea `objections` (`open`), vincula los adjuntos, pasa la tarea a `objection_filed` y audita. No hay aviso automático: el administrador lo ve en el inicio del panel.
4. El usuario cliente ve en la tarea su texto, sus imágenes y el estado de gestión (abierto, en gestión, resuelto). No ve las notas internas (RN-22).
5. Requiere conexión. Si falla la subida de alguna imagen, el formulario conserva lo escrito y permite reintentar o quitar la imagen. Los adjuntos sin descargo se limpian a las 24 h.

### F12. Gestionar descargo (administrador)
1. Inicio del panel: lista "Descargos abiertos" ordenada por antigüedad, con acciones rápidas: llamar, mail, WhatsApp (links `tel:`, `mailto:`, `https://wa.me/`).
2. Abre el descargo: ve tarea, registro, PDF, texto del descargo, imágenes adjuntas (visor con zoom), datos de contacto. Cambia estado a `in_review`, agrega notas internas, y finalmente `resolved`.
3. Cada cambio queda en auditoría y refleja el estado de la tarea (`in_review`, `resolved`).

### F13. Calificar colaboradores
1. En una tarea finalizada dentro del plazo, el usuario cliente ve a cada colaborador (con asignación activa en el momento de finalizar) con control de 1 a 5 estrellas y comentario opcional.
2. Guardar crea o edita su calificación. Pasado `objection_deadline_at` queda en solo lectura.
3. El administrador ve calificaciones por tarea y el promedio por colaborador en el panel.

### F14. Reasignación y baja de colaborador
1. Administrador: Usuarios > colaborador > "Dar de baja". Si tiene tareas `scheduled` o `on_site`, se muestra lista con selector de reemplazo por tarea (colaboradores activos) y opción "Crear colaborador nuevo".
2. Confirmar: asignaciones previas pasan a `active = false`, se crean nuevas, se invalidan sesiones y se audita (sin notificaciones).
3. El colaborador dado de baja conserva historial de tareas finalizadas para fines de auditoría y ya no es calificable en tareas donde fue reemplazado.

### F15. Cancelar tarea
Administrador, solo `scheduled`, con motivo obligatorio. Sin notificaciones: la tarea desaparece de la lista del colaborador al refrescar. Queda visible al cliente como "Cancelada".

### F16. Reenviar PDF
Administrador, en detalle de tarea finalizada: "Reenviar PDF", opcionalmente a otro email. Escribe outbox y auditoría.

### F17. Cambio de plazo de descargos
Administrador edita la empresa cliente. Solo afecta tareas que se finalicen después (RN-6).

---

## 14. Pantallas (especificación detallada)

Notación: **Propósito**, **Datos**, **Elementos**, **Acciones**, **Validaciones**, **Estados** (vacío, cargando, error, sin conexión), **Reglas**.

### 14.1 Aplicación móvil y web: compartida

Las pantallas M-xx corren en la app móvil (Android e iOS) y en la versión web de la misma app, y se adaptan a tres anchos (móvil, tableta, escritorio; reglas en 16.9). Todas respetan el tema elegido (RN-29) y los textos salen de i18n. En las pantallas sin sesión (M-01, M-04) hay controles compactos de idioma y tema.

**M-00 Splash y verificación de sesión.** Logo; decide ruta: sin sesión → M-01; con sesión → grupo según rol (colaborador → M-10, usuario cliente → M-30); si la cuenta está `inactive` muestra M-02.

**M-01 Inicio de sesión.** Campos "Usuario o mail" y contraseña (con mostrar/ocultar), botón "Ingresar" (`POST /auth/login`). Sin magic link ni "Olvidé mi contraseña"; texto de ayuda "Si olvidaste tu contraseña, pedísela a tu administrador" (RN-26). El identificador se normaliza a minúsculas y sin espacios. Errores: credenciales inválidas (mensaje genérico), cuenta inactiva (→ M-02), demasiados intentos (429 con tiempo de espera), sin conexión ("Necesitás conexión para ingresar"). Si `mustChangePassword` es verdadero → M-04. Después del primer ingreso la sesión persiste (refresh token) y la app abre sin red. Pie con controles compactos de idioma y tema.

**M-02 Cuenta desactivada.** Mensaje "Tu cuenta fue dada de baja. Contactá a tu administrador." Botón cerrar sesión.

**M-03 (eliminada).** La recuperación de contraseña por mail queda fuera del MVP (RN-23, RN-26). Se mantiene la numeración para no renumerar referencias.

**M-04 Primer ingreso: confirmar mail y definir contraseña.** Pantalla obligatoria, sin navegación hacia atrás ni atajos. Campos: mail (precargado con el que cargó el administrador, editable), nueva contraseña y repetir (mínimo 10 caracteres, distinta de la temporal, con indicador de fortaleza) y casilla "Confirmo que este mail es mío". Botón "Guardar y continuar" (`POST /auth/first-login`). Errores: mail en uso (409 `IDENTIFIER_TAKEN`), contraseñas distintas, contraseña débil. Éxito → M-10 o M-30 según rol. Pie con controles compactos de idioma y tema.

**M-05 Perfil y ajustes (ambos roles).** Nombre, email (solo lectura), teléfono (solo lectura; lo edita el administrador), bloque Preferencias (tema Claro, Oscuro o Sistema; idioma español o inglés; se guardan en el perfil), cerrar sesión, versión de la app. Sin foto ni avatar (RN-28). Para colaborador: estado de sincronización (pendientes, última sincronización, botón "Reintentar ahora").

### 14.2 Rol colaborador

En la versión web del colaborador no hay cola offline: registrar llegada, guardar el borrador y finalizar requieren conexión (RN-30). Sin conexión se muestra el aviso y esas acciones quedan bloqueadas.

**M-10 Mis tareas.**
- Propósito: lista de trabajo del colaborador.
- Datos: tareas `scheduled` y `on_site` asignadas activas; segunda pestaña "Finalizadas" (últimos 30 días, solo lectura).
- Elementos: pestañas "Hoy", "Próximas", "Finalizadas"; tarjeta por tarea con hora pautada, empresa cliente o usuario cliente, dirección corta, tipo de servicio, chip de estado (Programada, En sitio, Enviando, Finalizada), indicador de coasignados. Banner superior de sincronización cuando hay pendientes ("2 elementos sin enviar") y estado sin conexión.
- Acciones: tocar tarjeta → M-11; tirar para refrescar; botón de reintento de sync.
- Estados: vacío ("No tenés tareas asignadas hoy"), cargando skeleton, error con reintento, offline mostrando datos locales con aviso "Última actualización hh:mm".
- Reglas: no muestra costos ni importes.

**M-11 Detalle de tarea (colaborador).**
- Datos: empresa/usuario cliente, dirección, persona que recibe, inicio pautado, horas asignadas, descripción, indicaciones, tipo de servicio, otros colaboradores asignados, estado, llegada propia.
- Acciones según estado: `scheduled`: "Registrar llegada" (→ M-12), "Cómo llegar", "Llamar". `on_site` con llegada propia: "Finalizar tarea" (→ M-13). `on_site` sin llegada propia: "Registrar llegada". `completed`: "Ver registro" (→ M-16) y "Ver PDF".
- Reglas: si otro colaborador ya finalizó, el botón "Finalizar" desaparece y aparece el registro en solo lectura.
- Estados: tarea cancelada o reasignada muestra aviso y bloquea acciones.

**M-12 Registrar llegada (modal).** Texto "¿Hubo demora en atenderte?" con opciones Sí/No (obligatorio elegir), botón "Confirmar llegada". Guarda local y vuelve a M-11 con la hora registrada. Funciona sin conexión.

**M-13 Editor del registro.**
- Elementos: barra de herramientas con Negrita y Lista con viñetas; área de texto enriquecido (10tap/Tiptap); sección "Fotos (n/25)" con botón "Agregar fotos" (cámara o galería, selección múltiple), grilla de miniaturas con reordenar (arrastrar) y eliminar; indicador "Borrador guardado hh:mm".
- Validaciones: el texto no puede estar vacío (mínimo 10 caracteres sin formato); fotos opcionales; máximo 25 con mensaje "Llegaste al máximo de 25 fotos"; permiso de cámara/galería con mensaje explicativo si se deniega.
- Acciones: "Revisar y finalizar" (→ M-14), salir con confirmación si hay cambios sin guardar (el autoguardado cubre).
- Estados: compresión en curso por foto (progreso), error de foto (reintentar o eliminar).

**M-14 Confirmar y finalizar.**
- Elementos: resumen de solo lectura (texto formateado, miniaturas, hora de llegada, demora), aviso rojo "Una vez finalizada, no se puede editar", botones "Volver a editar" y "Finalizar tarea".
- Acción final: crea evento local `finalize`, navega a M-15.

**M-15 Estado de envío.**
- Elementos: barra "Guardado en el teléfono, enviando 7/12", lista de fotos con estado, botón "Reintentar", mensaje de que puede cerrar la app y seguir con otra tarea.
- Estados: completado → "Tarea finalizada y enviada. Se generó el PDF." con botón a M-10; error persistente muestra causa y pasos.

**M-16 Registro de tarea finalizada (solo lectura).** Texto formateado, galería (fotos expiradas muestran "Foto expirada"), visor de foto a pantalla completa con zoom, autor del registro y hora; botón "Ver PDF".

**M-17 Visor de PDF.** Visualiza el PDF (WebView o visor nativo) con botón compartir. Requiere conexión (URL prefirmada); sin conexión muestra aviso.

### 14.3 Rol usuario cliente

**M-30 Mis servicios.**
- Datos: tareas visibles por RN-1, paginadas.
- Elementos: filtros (estado, rango de fechas, tipo de servicio), buscador por dirección o descripción; tarjeta con fecha, tipo de servicio, dirección, colaboradores, chip (Programada, En sitio, Finalizada, Descargo realizado, En gestión, Resuelta, Cerrada, Cancelada), badge "Podés calificar" y cuenta regresiva si el plazo está abierto.
- Estados: vacío ("Todavía no tenés servicios registrados"), cargando, error.
- Reglas: sin costos.

**M-31 Detalle de servicio (cliente).**
- Datos: fecha y horas (llegadas, finalización), dirección, tipo de servicio, colaboradores, registro (texto y fotos), PDF, estado, plazo `objectionDeadlineAt`.
- Acciones: "Ver PDF"; "Presentar descargo" (→ M-32) si `canFileObjection`; "Calificar colaboradores" (→ M-33) si `canRate`; si hay descargo, bloque "Tu descargo" con su texto, sus imágenes adjuntas (visor con zoom) y el estado de gestión (abierto, en gestión, resuelto); no se muestran las notas internas del administrador (RN-22).
- Reglas: botones desaparecen pasado el plazo; texto "El plazo para presentar descargos venció el dd/mm/aaaa".

**M-32 Presentar descargo.** Campo de texto multilínea (5 a 4000) con contador. Sección "Imágenes (0/5)" con botón "Agregar imágenes" (cámara o galería), miniaturas con eliminar, progreso de subida por imagen y "Reintentar" ante error. Nota "Solo podés presentar un descargo por servicio y no se puede editar después". Botón "Enviar descargo" con confirmación, deshabilitado mientras haya subidas en curso. Éxito → M-31 con el descargo visible. Errores: plazo vencido, descargo ya existente, límite de imágenes. Requiere conexión.

**M-33 Calificar colaboradores.** Una tarjeta por colaborador activo en la tarea: nombre, 5 estrellas tocables, comentario opcional (1000), botón "Guardar calificación". Muestra la calificación previa y permite editarla mientras el plazo esté abierto. Texto aclaratorio: "Tu calificación solo la ve la empresa que presta el servicio."

**M-34 Visor de PDF.** Igual a M-17.

**M-35 Perfil del cliente.** Datos, empresa cliente asociada (solo lectura), bloque Preferencias (tema e idioma; se guardan en el perfil), cerrar sesión. Sin foto ni avatar (RN-28).

### 14.4 Panel de gestión web (administrador)

Layout: barra lateral izquierda (Inicio, Tareas, Descargos, Empresas cliente, Usuarios, Calificaciones, Tipos de servicio, Auditoría, Configuración), barra superior con búsqueda global, nombre de organización y menú de usuario. Responsive en tres anchos (reglas en 16.9): en escritorio, barra lateral fija; en tableta, riel de íconos; en móvil, menú hamburguesa con cajón lateral, tablas convertidas en tarjetas y formularios en una columna. El menú de usuario incluye selector de tema (Claro, Oscuro, Sistema) y de idioma (RN-29).

**P-00 Login del panel.** Usuario o mail y contraseña (sin recuperación por mail; si el primer administrador pierde la contraseña se restablece por script de consola). El primer ingreso fuerza la pantalla equivalente a M-04 en web. Solo rol administrador (otros roles son rechazados con mensaje). Controles compactos de idioma y tema en la esquina superior.

**P-01 Inicio.**
- Bloques por orden de prioridad: (1) Descargos abiertos (tabla ordenada por antigüedad: tarea, empresa/usuario, fecha de descargo, antigüedad en días, acciones rápidas llamar/mail/WhatsApp, botón "Gestionar"); (2) Tareas de hoy (estado y colaboradores); (3) Tareas en sitio ahora; (4) Alertas: PDF no enviado por falta de contacto, envíos fallidos, bajas con tareas pendientes, tareas vencidas sin llegada.
- Datos desde `GET /dashboard/home`. Estados vacíos amigables.

**P-02 Tareas (listado).**
- Tabla (TanStack Table) con columnas: N°, inicio pautado, empresa cliente / usuario cliente, dirección, tipo de servicio, colaboradores, estado, costo, finalizada, descargos hasta.
- Filtros: estado (multi), empresa cliente, colaborador, usuario cliente, tipo de servicio, rango de fechas, "con descargo", búsqueda de texto. Orden por columnas. Paginación por cursor. Botón "Nueva tarea". Acciones por fila: ver, editar (si permitido), cancelar, reenviar PDF.
- Exportación CSV: fuera del MVP.

**P-03 Crear/editar tarea.** Formulario descrito en F4, con secciones: Destinatario, Servicio, Programación, Asignación (selector múltiple de colaboradores activos con importe por colaborador; obligatorio al menos uno, RN-27), Costos. Validaciones en línea y resumen de errores. En edición de tarea `on_site` se bloquean destinatario y programación; se permiten asignaciones y costos. No editable si `completed` o posterior (solo costos, con auditoría).

**P-04 Detalle de tarea.**
- Pestañas: Resumen (datos, estado, línea de tiempo de transiciones desde `audit_log`), Asignaciones (llegada, demora, importe, estado activa/reemplazada, acción reasignar), Registro (texto y fotos, solo lectura), Documento (PDF, historial de envíos del outbox con estado y reintentos, botón "Reenviar PDF"), Descargo (si existe), Calificaciones (por colaborador), Auditoría.
- Acciones: cancelar (`scheduled`), reasignar, reenviar PDF, descargar PDF.

**P-05 Descargos.** Tabla con filtro por estado (abierto, en gestión, resuelto), empresa, fechas; columna antigüedad.

**P-06 Detalle de descargo.** Incluye galería de las imágenes adjuntas por el cliente (visor con zoom y descarga individual). Contexto de tarea, texto del descargo, contacto del autor con acciones rápidas, selector de estado, notas internas (guardado con auditoría), enlace al PDF y al registro. Línea de tiempo del descargo.

**P-07 Empresas cliente.** Listado con búsqueda; formulario de alta/edición (campos de la tabla, lista de contactos agregables, plazo de descargos con ayuda "Vacío = X horas por defecto"); pestaña "Usuarios cliente asociados" y "Tareas".

**P-08 Usuarios.** Listado con filtros por rol y estado. Alta/edición con campos obligatorios nombre, usuario, mail, teléfono, rol y contraseña temporal (botón Generar, mostrar/ocultar, copiar). Validación de unicidad en vivo (`GET /users/availability`) y definitiva en el backend (RN-25). La contraseña temporal se muestra una sola vez tras guardar. Para colaborador: pestaña "Calificaciones" y "Tareas". Para usuario cliente: asociación a empresa cliente. Acciones: restablecer contraseña (define una temporal, la muestra una sola vez e invalida sesiones), desactivar (flujo de reasignación P-09), reactivar.

**P-09 Dar de baja colaborador (asistente).** Muestra tareas pendientes con selector de reemplazo (obligatorio: ninguna tarea puede quedar sin colaborador, RN-27), botón "Crear colaborador nuevo" (modal rápido), confirmación final con resumen del impacto.

**P-10 Calificaciones.** Resumen por colaborador (promedio, cantidad, distribución 1 a 5), detalle de comentarios con tarea y fecha, filtros por colaborador y rango.

**P-11 Tipos de servicio.** Lista con alta, edición, activar/desactivar.

**P-12 Auditoría.** Búsqueda por entidad y rango, tabla con actor, acción, antes/después (diff resumido).

**P-13 Configuración.** Datos de la organización: nombre, logo, zona horaria, idioma por defecto (para el PDF y su mail), plazo de descargos por defecto. Sección "Envíos de mail" con estado del dominio (informativo).

---

## 15. Plan de desarrollo (tareas ordenadas por dependencia)

Estimación total MVP: 415 a 570 horas (10 a 14 semanas con un desarrollador full stack). Cada tarea: aceptación y verificación.

### Fase 0: Fundaciones (40 a 55 h)
- T0.1 Monorepo pnpm, TypeScript estricto, lint, formato, CI en GitHub Actions. Verificar: `pnpm -r typecheck && pnpm -r lint` en CI verde.
- T0.2 Proyecto Supabase, Drizzle, migración inicial (6.2), seed. Verificar: `db:migrate` y seed corren desde cero.
- T0.3 Migraciones RLS, triggers y vistas (6.3, 6.4). Verificar: tests de integración de aislamiento por organización y por rol.
- T0.4 API Fastify base: auth JWT, plugin de contexto (user, org, `SET LOCAL`), manejo de errores (8.3), logs. Verificar: `GET /me` por rol.
- T0.5 `packages/shared`: enums, zod, DTO, constantes, cliente API tipado.
- T0.6 Infraestructura transversal de interfaz: i18next con archivos `es` y `en` (panel, app y web), selector de idioma, tokens de tema claro y oscuro con selector Claro / Oscuro / Sistema, guardado de ambas preferencias en el perfil (`PATCH /me/preferences`, RN-29) y regla de lint contra textos fijos. Verificar: cambio de tema e idioma al instante en panel, app y web; ninguna clave de traducción faltante.

### Fase 1: Gestión base (60 a 80 h)
- T1.1 CRUD usuarios con contraseña temporal, tabla `user_identifiers`, login por usuario o mail, primer ingreso (F2), restablecer contraseña, baja y reactivación.
- T1.2 CRUD empresas cliente (F3) con plazo de descargos.
- T1.3 CRUD tipos de servicio.
- T1.4 Panel: login, layout, P-07, P-08, P-11, P-13.
Verificar: tests de unicidad cruzada usuario/mail (incluye concurrencia y mayúsculas), de permisos y del bloqueo por `must_change_password`; flujo de primer ingreso manual.

### Fase 2: Tareas y asignaciones (60 a 80 h)
- T2.1 API de tareas (crear con al menos un colaborador, RN-27, listar con filtros, detalle por DTO de rol, editar, cancelar).
- T2.2 Máquina de estados y auditoría (sección 7) con tests de transiciones.
- T2.3 Asignaciones, reasignación y baja de colaborador (F14).
- T2.4 Panel: P-02, P-03, P-04 (pestañas Resumen y Asignaciones), P-09.
Verificar: test de contrato (sin costos fuera del admin), RN-2, RN-9, RN-14.

### Fase 3: Registro, fotos y offline (110 a 150 h)
- T3.1 Spike (1 semana): Expo + 10tap + selección de 25 fotos + compresión + subida a Storage con y sin conexión en Android de gama baja. Documentar hallazgos.
- T3.2 Storage: presign, confirm, tope de 25, claves, borrado por job a los 180 días.
- T3.3 Endpoint `arrival` y `finalize` idempotentes, corrección de reloj (10.4), cálculo de `objection_deadline_at`, inmutabilidad.
- T3.4 Móvil: M-00 a M-05, M-10, M-11, M-12.
- T3.5 SQLite local, outbox, sincronizador (10.3), borradores.
- T3.6 Móvil: M-13, M-14, M-15, M-16.
Verificar: pruebas con red cortada en cada paso, duplicados cero, carrera de dos colaboradores, test de inmutabilidad.

### Fase 4: PDF y mail (40 a 60 h)
- T4.1 Plantilla PDF (9.3) y worker `generate-pdf`.
- T4.2 Gmail SMTP (cuenta de envío del MVP), worker `send-pdf-mail`, outbox y reglas RN-4.
- T4.3 Panel: pestaña Documento de P-04, reenvío.
- T4.4 Móvil y web: M-17, M-34 (visor).
Verificar: mail llega a bandeja de entrada (no spam), casos sin contacto, reintentos.

### Fase 5: Cliente, descargos y calificaciones (70 a 90 h)
- T5.1 API de descargos con adjuntos (presign, confirm, tope 5, limpieza) y calificaciones con plazo (RN-6, RN-7, RN-8, RN-21, RN-22).
- T5.2 Móvil/web cliente: M-30, M-31, M-32, M-33, M-35.
- T5.3 Panel: P-01 (inicio con descargos), P-05, P-06, P-10 y pestañas Descargo y Calificaciones.
- T5.4 Visibilidad RN-1 con tests de RLS (tareas por usuario y por empresa, asociar/desasociar).
Verificar: rechazo post plazo en servidor, un solo descargo, edición de calificación en plazo.

### Fase 6: Endurecimiento y publicación (35 a 55 h)
- T6.1 Rate limiting, headers, revisión de seguridad, revisión de logs sin datos personales.
- T6.2 Expiración de fotos (job), "Foto expirada" en UI.
- T6.3 Auditoría P-12, backups (plan Free) o Supabase Pro.
- T6.4 Builds EAS, ícono y splash, política de privacidad, fichas de tiendas, prueba cerrada de Google Play con 12 testers, App Store con cuenta demo.
- T6.5 Revisión legal Ley 18.331.

---

## 16. Diseño de pantallas con Stitch

### 16.1 Sistema de diseño (aplicar a todos los prompts)
- Estilo: limpio, profesional, funcional; tono confiable de operaciones de campo. Evitar estética decorativa.
- Color (todas las combinaciones de texto cumplen AA 4,5:1):
  - Primario azul petróleo `#0F4C5C` (texto blanco sobre él).
  - Éxito verde `#1F7A4A` (texto blanco sobre él, 5,3:1).
  - Advertencia ámbar `#E0A100`: solo como fondo con texto oscuro `#1B2528` (6,9:1), o como ícono o borde. Nunca texto blanco sobre ámbar.
  - Error `#C0392B` (texto blanco sobre él, 5,4:1).
  - Fondo `#F6F8F9`, superficie `#FFFFFF`, texto `#1B2528`, texto secundario `#5C6B70`, bordes `#D9E1E4`.
- Chips de estado (fondo claro con texto oscuro, forma de píldora):

| Estado | Fondo | Texto |
|---|---|---|
| Programada | `#E3EAEE` | `#34454B` |
| En sitio | `#DCEBFA` | `#0B4A8A` |
| Enviando | `#FCEFC7` | `#6B4E00` |
| Finalizada | `#DDF1E5` | `#17613A` |
| Descargo realizado | `#FADFD0` | `#8A3510` |
| En gestión | `#E8E0F7` | `#4B2E8C` |
| Resuelta | `#17613A` | `#FFFFFF` |
| Cerrada | `#E6E9EA` | `#4A585D` |
| Cancelada | `#F8DAD6` | `#9B2C20` |

- Tema oscuro (se activa con el selector Claro / Oscuro / Sistema, RN-29). Mismos roles de color, valores propios; todas las combinaciones cumplen AA:
  - Fondo `#0E1518`, superficie `#172125`, bordes `#2A383D`, texto `#E6ECEE` (13,7:1 sobre superficie), texto secundario `#9FB0B6` (7,3:1 sobre superficie).
  - Primario `#4FB3C8` con texto oscuro `#0E1518` en los botones (7,6:1); como texto o ícono sobre superficie, 6,7:1.
  - Éxito `#4CC38A` y error `#FF7A6B` como texto o ícono sobre superficie. El botón éxito sigue siendo `#1F7A4A` con texto blanco. El ámbar sigue siendo fondo con texto oscuro `#1B2528`.
  - Barra lateral del panel en oscuro: `#0A1F25` con texto blanco.
  - Chips en oscuro (fondo con texto claro):

| Estado | Fondo | Texto |
|---|---|---|
| Programada | `#28373D` | `#CFDBDF` |
| En sitio | `#17324F` | `#A9D0F5` |
| Enviando | `#4A3A0A` | `#F5DC8C` |
| Finalizada | `#15402B` | `#9EE0BB` |
| Descargo realizado | `#4D2412` | `#F5BFA3` |
| En gestión | `#33275A` | `#CDBEF2` |
| Resuelta | `#1F7A4A` | `#FFFFFF` |
| Cerrada | `#2A3438` | `#B8C4C8` |
| Cancelada | `#4D1E19` | `#F5B3AB` |

  - Las fotos de evidencia no se alteran en el tema oscuro. Las sombras se reemplazan por bordes sutiles.
- Preferencias de interfaz (RN-29): selector de tema (control segmentado Claro / Oscuro / Sistema) y selector de idioma (lista con nombre del idioma en su propia lengua). Viven en Perfil (M-05, M-35) y en el menú de usuario del panel. En las pantallas sin sesión (M-01, M-04, P-00) aparecen como controles compactos (ícono de idioma e ícono de tema) en el pie o en una esquina.
- Textos: los textos de los prompts y del documento son el idioma por defecto (español rioplatense). Los diseños deben tolerar textos hasta un 40 % más largos (alemán, portugués, inglés) sin cortarse: botones y chips que crecen en ancho, sin anchos fijos.
- Tipografía: Inter (títulos 600, cuerpo 400). Escala móvil: 24/20/16/14/12. Escala escritorio y panel: 28/22/16/14/12.
- Forma: radios 12 px en tarjetas, 10 px en botones, 999 px en chips. Sombras sutiles.
- Personas: sin fotos, sin avatares y sin iniciales en círculos (RN-28). Los colaboradores, usuarios cliente y administradores aparecen solo con su nombre en texto. Las únicas imágenes son el logo de la empresa proveedora de servicios, las fotos de evidencia del registro y las imágenes adjuntas a un descargo.
- Responsive (vale para la app web de colaborador y cliente y para el panel; todo lo visible se adapta):
  - Móvil: 360 a 767 px (diseño base 390 px).
  - Tableta: 768 a 1199 px (diseño base 834 px).
  - Escritorio: 1200 px o más (diseño base 1440 px), contenido con ancho máximo de 1120 px en la app y de 1360 px en el panel.
  - Navegación de la app (colaborador y cliente): barra inferior en móvil (colaborador: Mis tareas, Perfil; cliente: Servicios, Perfil), riel lateral de íconos con etiquetas en tableta, barra lateral clara con etiquetas en escritorio.
  - Navegación del panel: barra lateral oscura `#0F4C5C` en escritorio, riel de íconos en tableta, menú hamburguesa con cajón lateral en móvil.
  - Tablas del panel: tabla densa con encabezado fijo en escritorio, tabla con menos columnas en tableta, lista de tarjetas en móvil.
  - Formularios: dos columnas en escritorio, una columna en tableta y móvil. Diálogos: centrados en escritorio y tableta, pantalla completa o panel inferior en móvil.
- Móvil: objetivos táctiles de 48 px, botón principal fijo al pie en pantallas de acción, banner de conexión.
- Idioma: español rioplatense. Contenido de ejemplo realista de Uruguay (calles de Montevideo, empresas ficticias).

### 16.2 Cómo trabajar en Stitch
1. Crear el sistema de diseño con el prompt 16.4.
2. Generar una pantalla por prompt: las variantes (con descargo, cerrada, error, sin conexión) son prompts separados, identificados con letra (M-11a, M-11b).
3. Generar cada pantalla en formato móvil (390 px) y, con los prompts de 16.10, en escritorio (1440 px). La versión tableta (834 px) se genera solo para las pantallas ancla M-10, M-30, P-01 y P-02; el resto se deriva de ellas.
4. Tema oscuro: se genera con la plantilla de 16.11 solo para las pantallas ancla (M-01, M-05, M-10, M-31a, M-35, P-01, P-02, P-06); el resto se deriva del sistema de diseño en código.
5. Orden de generación:
   - Comunes de la app: M-00, M-01, M-02, M-04, M-05, M-35.
   - Colaborador: M-10, M-10b, M-11a, M-11b, M-12, M-13, M-14, M-15a, M-15b, M-16a, M-16b, M-17a, M-17b.
   - Cliente: M-30, M-31a, M-31b, M-31c, M-32, M-33a, M-33b (el visor M-34 es el mismo diseño que M-17).
   - Panel: P-00a, P-00b, P-01, P-01b, P-02, P-03, P-04, P-05, P-06, P-07, P-08a, P-08b, P-08c, P-09, P-10, P-11, P-12, P-13.
6. Exportar y pasar a Claude Code junto con este documento (la pantalla define la forma; este documento define el comportamiento).

### 16.3 Cobertura
Toda pantalla de la sección 14 tiene prompt, excepto M-03 (eliminada) y M-34 (igual a M-17). Los elementos que no tienen número propio en la sección 14 (menú de usuario, diálogo de contraseña temporal, diálogo de restablecer contraseña) figuran como P-01b, P-08b y P-08c.

### 16.4 Prompt: sistema de diseño
"Diseñá el sistema de diseño de una app de gestión de servicios en terreno llamada ProveCheck, en español de Uruguay, con versión móvil, tableta y escritorio, y con tema claro y tema oscuro. Estilo limpio y profesional. Tema oscuro: fondo #0E1518, superficie #172125, bordes #2A383D, texto #E6ECEE, texto secundario #9FB0B6, primario #4FB3C8 con texto oscuro, éxito #4CC38A, error #FF7A6B. Tema claro: primario azul petróleo #0F4C5C, éxito verde #1F7A4A, advertencia ámbar #E0A100 (solo como fondo con texto oscuro #1B2528, nunca con texto blanco), error #C0392B, fondo #F6F8F9, superficie #FFFFFF, texto #1B2528, texto secundario #5C6B70. Tipografía Inter. Componentes: botones primario/secundario/destructivo, campos de texto, selector, chips de estado tonales (Programada gris azulado, En sitio azul, Enviando ámbar claro, Finalizada verde claro, Descargo realizado terracota claro, En gestión violeta claro, Resuelta verde oscuro sólido, Cerrada gris, Cancelada rojo claro), tarjetas de tarea, banner de conexión, estrellas de calificación, editor de texto con negrita y viñetas, grilla de fotos de evidencia, tabla de datos para panel de escritorio, navegación adaptable (barra inferior en móvil, riel de íconos en tableta, barra lateral en escritorio), control segmentado de tema (Claro, Oscuro, Sistema) y selector de idioma. Los componentes deben tolerar textos hasta un 40 % más largos. No incluir fotos ni avatares de personas: las personas se muestran solo con su nombre. Radios 12 px, sombras sutiles, objetivos táctiles de 48 px."

### 16.5 Prompts móvil: comunes
**M-00:** "Pantalla de carga (splash) de ProveCheck: fondo azul petróleo #0F4C5C, logo ProveCheck blanco centrado, indicador de carga sutil debajo y la leyenda 'Verificando sesión'. Sin otros elementos."

**M-01:** "Pantalla de inicio de sesión con logo ProveCheck, campos 'Usuario o mail' y contraseña con mostrar/ocultar, botón primario 'Ingresar', texto de ayuda 'Si olvidaste tu contraseña, pedísela a tu administrador'. En el pie, controles compactos de idioma (ícono de globo con 'Español') y de tema (ícono de sol y luna). Diseño limpio, mucho aire."

**M-02:** "Pantalla 'Cuenta desactivada': ícono de cuenta bloqueada en gris, título 'Tu cuenta fue dada de baja', texto 'Contactá a tu administrador.' y botón secundario 'Cerrar sesión'. Sin barra de navegación, mucho aire."

**M-04:** "Pantalla obligatoria de primer ingreso, sin botón de volver: título 'Confirmá tu mail y creá tu contraseña', campo mail precargado y editable, campos nueva contraseña y repetir contraseña con indicador de fortaleza, casilla 'Confirmo que este mail es mío', botón primario 'Guardar y continuar'. Mensajes de error en línea para mail ya en uso y contraseñas que no coinciden. En el pie, controles compactos de idioma y de tema."

**M-05:** "Pantalla de perfil de colaborador, sin foto ni avatar: nombre, email, teléfono, bloque 'Sincronización' con 'Última sincronización 14:32', '2 pendientes' y botón 'Reintentar ahora', bloque 'Preferencias' con control segmentado 'Tema: Claro / Oscuro / Sistema' y selector 'Idioma: Español', versión de la app, botón 'Cerrar sesión'. Barra inferior: Mis tareas, Perfil."

**M-35:** "Pantalla de perfil de usuario cliente, sin foto ni avatar: nombre, mail, teléfono, empresa cliente asociada 'Estudio Pereira & Asoc.' (solo lectura), bloque 'Preferencias' con control segmentado 'Tema: Claro / Oscuro / Sistema' y selector 'Idioma: Español', versión de la app y botón 'Cerrar sesión'. Barra inferior: Servicios, Perfil."

### 16.6 Prompts móvil: colaborador
**M-10:** "Pantalla móvil 'Mis tareas' para un colaborador. Pestañas Hoy, Próximas, Finalizadas. Banner superior ámbar con texto oscuro 'Sin conexión: mostrando datos de las 14:32' y otro 'Tenés 2 elementos sin enviar'. Lista de tarjetas: hora pautada 09:00, empresa 'Estudio Pereira & Asoc.', dirección 'Av. 18 de Julio 1234, Montevideo', tipo de servicio 'Limpieza profunda', chip de estado 'Programada', texto 'Con 1 colaborador más'. Otra tarjeta con chip azul 'En sitio' y otra con chip 'Enviando 7/12'. Barra inferior: Mis tareas, Perfil. Sin precios."

**M-10b:** "Pantalla 'Mis tareas' en la versión web del colaborador, sin conexión: banner ámbar con texto oscuro 'Sin conexión: para registrar llegada o finalizar necesitás conexión', tarjetas de tareas visibles con la última copia, botones de acción deshabilitados con ícono de candado y botón 'Reintentar'. Mismo diseño que M-10."

**M-11a:** "Detalle de tarea para colaborador, tarea programada. Encabezado con empresa y chip de estado 'Programada'. Secciones: Dirección con botón 'Cómo llegar', Contacto con botón 'Llamar', Inicio pautado, Horas asignadas, Persona que recibe, Descripción, Indicaciones en caja resaltada, Otros colaboradores (lista de nombres). Botón principal fijo al pie 'Registrar llegada'. No mostrar costos."

**M-11b:** "Detalle de tarea para colaborador, tarea en sitio con llegada registrada a las 09:12. Mismo diseño que la tarea programada, con chip azul 'En sitio', línea 'Llegada: 09:12' y botón principal fijo al pie 'Finalizar tarea'. No mostrar costos."

**M-12:** "Modal inferior 'Registrar llegada': pregunta '¿Hubo demora en atenderte?' con dos opciones grandes seleccionables Sí y No, botón 'Confirmar llegada' deshabilitado hasta elegir, texto pequeño 'Se guardará aunque no tengas conexión'."

**M-13:** "Editor de registro de tarea. Barra de herramientas con Negrita y Lista con viñetas, área de texto con ejemplo de viñetas, indicador 'Borrador guardado 14:05'. Sección 'Fotos (8/25)' con botón 'Agregar fotos' y grilla de miniaturas de evidencia en 3 columnas con ícono de arrastrar y botón eliminar, una miniatura con barra de progreso de compresión, otra con error y 'Reintentar'. Botón fijo 'Revisar y finalizar'."

**M-14:** "Pantalla 'Revisar y finalizar': resumen en solo lectura del texto con viñetas, tira horizontal de miniaturas, hora de llegada 09:12 y demora 'No'. Caja de advertencia ámbar con texto oscuro: 'Una vez finalizada, no vas a poder editar el registro'. Botones: 'Volver a editar' (secundario) y 'Finalizar tarea' (primario)."

**M-15a:** "Pantalla de estado de envío: título 'Guardado en el teléfono', barra de progreso 'Enviando 7/12 fotos', lista de fotos con íconos de estado (enviada, subiendo, pendiente, error), texto 'Podés cerrar la app y seguir con otra tarea', botón 'Reintentar ahora'."

**M-15b:** "Pantalla de estado de envío completado: check verde grande, título 'Tarea finalizada y enviada', texto 'Se generó el PDF', botón primario 'Volver a mis tareas'."

**M-16a:** "Registro de tarea finalizada en solo lectura: texto formateado, galería de evidencia en 3 columnas, una foto con etiqueta gris 'Foto expirada', autor del registro (nombre en texto) y hora, botón 'Ver PDF'."

**M-16b:** "Registro de tarea finalizada en solo lectura, mismo diseño que M-16a, con aviso azul en la parte superior 'Otro colaborador ya finalizó esta tarea'."

**M-17a:** "Visor de PDF del registro de servicio: barra superior con flecha de volver, título 'Registro de servicio N° 1042' y botón compartir; documento A4 vertical con páginas desplazables y control de zoom."

**M-17b:** "Visor de PDF sin conexión: barra superior igual a la del visor, y en el centro un aviso ámbar con texto oscuro 'Necesitás conexión para ver el PDF' con botón 'Reintentar'."

### 16.7 Prompts móvil: usuario cliente
**M-30:** "Pantalla 'Mis servicios' para un usuario cliente: buscador, filtros (estado, fechas), tarjetas con fecha, tipo de servicio, dirección, nombres de los colaboradores, chip de estado (Finalizada, Descargo realizado, En gestión, Cerrada) y badge verde 'Podés calificar · quedan 9 días'. Barra inferior: Servicios, Perfil. Sin costos."

**M-31a:** "Detalle de servicio finalizado para cliente: datos, colaboradores (nombres en texto), registro con texto y galería, botón 'Ver PDF', botón primario 'Presentar descargo' y secundario 'Calificar colaboradores', cuenta regresiva 'El plazo vence el 19/11/2026 14:05'."

**M-31b:** "Detalle de servicio con descargo presentado: mismo diseño que M-31a, con bloque 'Tu descargo' que muestra el texto, miniaturas de las imágenes que adjuntó y chip 'En gestión'. Sin notas internas y sin botón 'Presentar descargo'."

**M-31c:** "Detalle de servicio cerrado: mismo diseño que M-31a, sin botones de descargo ni calificación, chip gris 'Cerrada' y texto 'El plazo para presentar descargos venció el 19/11/2026'."

**M-32:** "Formulario 'Presentar descargo': campo multilínea con contador 0/4000, sección 'Imágenes (2/5)' con botón 'Agregar imágenes' y miniaturas con eliminar, una con barra de progreso y otra con error y 'Reintentar', nota 'Solo podés presentar un descargo por servicio y no se puede editar después', botón 'Enviar descargo' y diálogo de confirmación."

**M-33a:** "Pantalla 'Calificar colaboradores': una tarjeta por colaborador con su nombre en texto (sin foto ni avatar), 5 estrellas grandes, campo de comentario opcional y botón 'Guardar calificación'. Nota 'Tu calificación solo la ve la empresa que presta el servicio'."

**M-33b:** "Pantalla 'Calificar colaboradores' en modo edición: mismo diseño que M-33a, con una calificación previa cargada (4 estrellas y un comentario) y el texto 'Podés editarla hasta el 19/11/2026'."

### 16.8 Prompts panel (escritorio 1440 px)
**P-00a:** "Login del panel de gestión de escritorio: tarjeta centrada sobre fondo #F6F8F9 con logo ProveCheck, campos 'Usuario o mail' y contraseña con mostrar/ocultar, botón primario 'Ingresar' y texto 'Si perdiste tu contraseña, contactá al responsable del sistema'. En la esquina superior derecha, controles compactos de idioma y de tema."

**P-00b:** "Login del panel de gestión con error: mismo diseño que P-00a y mensaje de error en línea rojo 'Este panel es solo para administradores'."

**P-01 Inicio:** "Panel de gestión de escritorio, barra lateral oscura azul petróleo con Inicio, Tareas, Descargos, Empresas cliente, Usuarios, Calificaciones, Tipos de servicio, Auditoría, Configuración. Inicio con: tabla 'Descargos abiertos' ordenada por antigüedad (tarea, empresa, fecha, antigüedad '5 días' resaltada en ámbar, iconos llamar/mail/WhatsApp, botón Gestionar), debajo dos columnas 'Tareas de hoy' y 'En sitio ahora', y panel 'Alertas' (PDF no enviado por falta de contacto, envío fallido, baja con tareas pendientes)."

**P-01b Menú de usuario:** "Panel de gestión de escritorio con el menú de usuario desplegado desde la barra superior: nombre del administrador y organización, control segmentado 'Tema: Claro / Oscuro / Sistema', selector 'Idioma: Español', y opciones 'Cambiar contraseña' y 'Cerrar sesión'."

**P-02 Tareas:** "Listado de tareas en tabla densa: N°, inicio, empresa/usuario cliente, dirección, tipo de servicio, colaboradores (nombres separados por coma), chip de estado, costo en UYU, finalizada, descargos hasta. Barra de filtros arriba (estado múltiple, empresa, colaborador, tipo, fechas, 'con descargo', búsqueda), botón primario 'Nueva tarea', paginación, menú de acciones por fila."

**P-03 Crear tarea:** "Formulario de nueva tarea en secciones: Destinatario (empresa cliente y/o usuario cliente con aviso 'Elegí al menos uno'), Servicio (tipo, descripción, indicaciones, persona que recibe), Programación (fecha y hora, horas asignadas), Asignación (selector múltiple de colaboradores, obligatorio con aviso 'Asigná al menos un colaborador', con campo de importe UYU por cada uno), Costos (costo de la tarea UYU). Resumen lateral fijo y botones 'Guardar' y 'Cancelar'. Con el error en línea 'Asigná al menos un colaborador' visible en una variante del formulario enviado vacío."

**P-04 Detalle de tarea:** "Detalle con encabezado (N°, chip de estado, acciones Reasignar, Cancelar, Reenviar PDF) y pestañas Resumen (línea de tiempo de estados), Asignaciones (llegada, demora, importe, activa), Registro, Documento (PDF y tabla de envíos con estado enviado/fallido/omitido), Descargo, Calificaciones, Auditoría."

**P-05 Descargos:** "Listado de descargos: pestañas con contadores 'Abiertos (3)', 'En gestión (2)', 'Resueltos (14)'. Tabla con N° de tarea, empresa o usuario cliente, fecha del descargo, antigüedad en días (resaltada en ámbar en los más antiguos), cantidad de imágenes adjuntas, chip de estado (Abierto, En gestión, Resuelto) y botón 'Gestionar'. Filtros arriba: empresa, fechas y búsqueda. Paginación."

**P-06 Detalle de descargo:** "Pantalla de gestión de descargo en dos columnas: izquierda con texto del descargo, galería de imágenes adjuntas, datos del autor y acciones rápidas de contacto, resumen de tarea con enlaces al PDF y registro; derecha con selector de estado (Abierto, En gestión, Resuelto), notas internas y línea de tiempo."

**P-07 Empresa cliente:** "Formulario de empresa cliente con razón social, dirección, teléfono, email, lista de contactos agregables (nombre, cargo, teléfono, email), observaciones, campo 'Plazo de descargos (horas)' con ayuda 'Vacío = 336 horas por defecto', pestañas Usuarios asociados y Tareas."

**P-08a Usuarios:** "Listado de usuarios con filtros por rol y estado, chips de rol y estado, acciones (editar, restablecer contraseña, dar de baja). Formulario lateral de alta con nombre, usuario, mail, teléfono, rol, contraseña temporal (botón 'Generar', mostrar y copiar) y empresa cliente (solo si es usuario cliente), con validación en línea 'Usuario ya en uso' y 'Mail ya en uso'. Sin fotos ni avatares en la lista."

**P-08b:** "Diálogo modal 'Usuario creado': muestra usuario, mail y la contraseña temporal en un campo grande con botón 'Copiar'. Aviso ámbar con texto oscuro: 'Esta contraseña se muestra una sola vez. Entregásela al usuario: deberá cambiarla en su primer ingreso.' Botón primario 'Listo'."

**P-08c:** "Diálogo 'Restablecer contraseña' para el usuario 'lferreira': texto 'Se cerrarán sus sesiones y tendrá que crear una contraseña nueva al ingresar', campo de contraseña temporal con botón 'Generar' y mostrar/ocultar, botón destructivo 'Restablecer' y botón secundario 'Cancelar'. Variante de éxito en el mismo diálogo, con la nueva contraseña temporal visible una sola vez y botón 'Copiar'."

**P-09 Baja de colaborador:** "Asistente modal en dos pasos: lista de tareas pendientes con selector de colaborador reemplazante por fila (obligatorio, no se puede dejar una tarea sin colaborador) y botón 'Crear colaborador nuevo', luego confirmación con resumen del impacto y botón destructivo 'Dar de baja'."

**P-10 Calificaciones:** "Pantalla de calificaciones por colaborador: tarjetas con nombre, promedio (4,6), cantidad y distribución 1 a 5 en barras; debajo tabla de comentarios con tarea, cliente, estrellas y fecha; filtros por colaborador y fechas."

**P-11 Tipos de servicio:** "Lista de tipos de servicio con nombre, interruptor 'Activo' y botón editar; ejemplos 'Limpieza profunda', 'Control de plagas', 'Mantenimiento de aire acondicionado', 'Limpieza de vidrios'. Botón primario 'Nuevo tipo de servicio' que abre un diálogo con campo nombre y validación en línea 'Ya existe un tipo con ese nombre'."

**P-12 Auditoría:** "Pantalla de auditoría: filtros por entidad (Tarea, Usuario, Empresa cliente, Descargo, Calificación), identificador y rango de fechas. Tabla con fecha y hora, actor, entidad, acción (por ejemplo 'Cambio de estado', 'Reasignación', 'Cambio de costo', 'Reenvío de PDF') y resumen del cambio antes → después (por ejemplo 'estado: programada → en_sitio'). Fila expandible con el detalle antes y después en bloque monoespaciado. Paginación."

**P-13 Configuración:** "Pantalla de configuración en tarjetas: 'Datos de la organización' (nombre, logo con botón 'Subir logo', zona horaria 'America/Montevideo', idioma por defecto de la organización con ayuda 'Se usa en el PDF y en el mail que recibe el cliente', plazo de descargos por defecto en horas con ayuda 'Equivale a 14 días') y 'Envíos de mail' informativa con estado del dominio (SPF verificado, DKIM verificado, remitente). Botón primario 'Guardar cambios'."

### 16.9 Responsive: reglas de adaptación por pantalla

App de colaborador y cliente (web y móvil):

| Pantallas | Tableta (834 px) | Escritorio (1440 px) |
|---|---|---|
| M-10 y M-30 (listas) | Lista a la izquierda (320 px) y detalle a la derecha | Barra lateral clara con navegación, lista de 420 px y detalle a la derecha |
| M-11, M-31 (detalles) | Panel derecho; acciones principales en la barra superior del panel | Igual, con contenido de ancho máximo 720 px |
| M-12 (llegada) | Diálogo centrado | Diálogo centrado de 480 px |
| M-13 (editor) | Ancho completo, grilla de fotos de 4 columnas | Ancho máximo 840 px, grilla de 6 columnas |
| M-14, M-15, M-32, M-33 | Contenido centrado de 640 px | Contenido centrado de 640 px dentro del panel derecho |
| M-16, M-17 | Galería de 4 columnas, visor a ancho completo | Galería de 5 columnas, visor con páginas centradas |
| M-01, M-02, M-04 | Tarjeta centrada de 440 px sobre fondo `#F6F8F9` | Igual |
| M-05, M-35 | Tarjeta centrada de 560 px | Igual, dentro del panel derecho |
| Banner de conexión | Ancho completo bajo la cabecera | Igual |

Panel de gestión (móvil y tableta):

| Elemento | Tableta (834 px) | Móvil (390 px) |
|---|---|---|
| Navegación | Riel lateral de íconos que se expande | Menú hamburguesa con cajón lateral |
| Tablas (P-02, P-05, P-08a, P-12) | Se ocultan columnas secundarias (costo, finalizada, descargos hasta); el resto está en el detalle | Lista de tarjetas con N°, cliente, estado y fecha, y menú ⋯ de acciones |
| Filtros | Barra de filtros colapsable | Botón 'Filtros' que abre un panel inferior, con chips de filtros activos |
| Formularios (P-03, P-07, P-08a, P-13) | Una columna; el resumen lateral de P-03 pasa debajo del formulario | Una columna; barra inferior fija con 'Guardar' |
| Detalles con pestañas (P-04, P-07) | Pestañas en una fila | Pestañas con desplazamiento horizontal |
| P-06 (dos columnas) | Dos columnas estrechas | Apiladas: estado y notas internas arriba, texto e imágenes debajo |
| P-01 (inicio) | Bloques apilados con 'Tareas de hoy' y 'En sitio ahora' en dos columnas | Todo apilado en orden de prioridad (descargos, hoy, en sitio, alertas) |
| Diálogos (P-08b, P-08c, P-09) | Centrados | Pantalla completa |

### 16.10 Prompts de adaptación responsive
Plantilla para cada pantalla de la app: "Adaptá la pantalla {ID} ({nombre}) a escritorio 1440 px: {descripción de la columna Escritorio de la tabla de 16.9}. Mantené los mismos textos, datos de ejemplo, colores y componentes del sistema de diseño ProveCheck. No incluyas fotos ni avatares de personas."

Plantilla para tableta (solo M-10, M-30, P-01, P-02): "Adaptá la pantalla {ID} ({nombre}) a tableta 834 px: {descripción de la columna Tableta de 16.9}. Mantené los mismos textos, datos de ejemplo, colores y componentes del sistema de diseño ProveCheck."

Plantilla para el panel en móvil: "Adaptá la pantalla {ID} ({nombre}) del panel de gestión a móvil 390 px: {descripción de la columna Móvil de 16.9}. Mantené los mismos textos, datos de ejemplo, colores y componentes del sistema de diseño ProveCheck. No incluyas fotos ni avatares de personas."

Ejemplo (M-10 en escritorio): "Adaptá la pantalla M-10 (Mis tareas del colaborador) a escritorio 1440 px: barra lateral clara con Mis tareas y Perfil, lista de tareas de 420 px a la izquierda con las pestañas Hoy, Próximas y Finalizadas, y el detalle de la tarea seleccionada a la derecha con las acciones principales en la barra superior del panel. Mantené los mismos textos, datos de ejemplo, colores y componentes del sistema de diseño ProveCheck. No incluyas fotos ni avatares de personas."

### 16.11 Prompt de tema oscuro
Plantilla para las pantallas ancla (M-01, M-05, M-10, M-31a, M-35, P-01, P-02, P-06): "Generá la pantalla {ID} ({nombre}) en tema oscuro del sistema de diseño ProveCheck: fondo #0E1518, superficie #172125, bordes #2A383D, texto #E6ECEE, texto secundario #9FB0B6, botón primario #4FB3C8 con texto oscuro, chips de estado con fondo oscuro tonal y texto claro. Mismos textos, datos de ejemplo y estructura que la versión clara. Las fotos de evidencia no se alteran. No incluyas fotos ni avatares de personas."

---

## 17. Definiciones de terminado (DoD)

Una tarea está terminada si: compila y tipa sin errores, pasa lint, tiene tests de las reglas RN involucradas, verificada su acción a mano en dispositivo o navegador, auditoría escrita donde corresponda, sin exponer costos fuera del administrador, código, comentarios, tests y commits en inglés, textos desde los archivos de traducción (i18n) sin cadenas fijas, verificada en tema claro y oscuro y en móvil, tableta y escritorio, y la documentación (este archivo) actualizada si cambió una regla.

## 18. Supuestos pendientes de confirmar

1. El colaborador sin llegada propia no puede finalizar desde la UI; el camino de llegada implícita en la API solo cubre sincronización offline desordenada.
2. Unicidad global (no por organización) y sin distinguir mayúsculas. Usuario de 3 a 30 caracteres: minúsculas, números, punto, guion y guion bajo, sin "@".
3. El administrador usa solo el panel web. El primer administrador se crea por script de seed y también debe cambiar su contraseña al primer ingreso.
4. Un usuario pertenece a una sola organización.
5. Confirmar con un contador el tratamiento de IVA de servicios del exterior (heredado de la especificación técnica).
6. Dominio de correo y de la app por definir al comprar el dominio (.uy sugerido).
