# ProveCheck: especificación técnica, stack y costos (versión final, 31/10/2026)
 
Alcance del MVP cerrado con las respuestas del autor. Precios en USD, tomados de las pricing pages oficiales en octubre de 2026 (revisar al contratar).
 
## Terminología
 
- **Empresa proveedora de servicios:** la empresa que presta el servicio y usa el panel de gestión.
- **Administrador:** usuario de la empresa proveedora de servicios que gestiona el panel de gestión.
- **Colaborador:** empleado de la empresa proveedora de servicios que realiza las tareas.
- **Empresa cliente:** la empresa que recibe el servicio.
- **Usuario cliente:** persona de contacto que accede a la app, asociada o no a una empresa cliente.
- **Tarea:** trabajo asignado a uno o más colaboradores en una empresa cliente.
- **Tarea finalizada:** tarea cuyo registro fue enviado por el colaborador.
- **Descargo:** observación o reclamo de un usuario cliente sobre una tarea finalizada.
- **Descargo realizado:** estado que toma la tarea cuando se presenta un descargo.
## 1. Qué es
 
App genérica para empresas proveedoras de servicios. El núcleo es el registro de tareas: asignación, llegada del colaborador, finalización con evidencia (fotos y observaciones), PDF automático por mail al usuario cliente, descargos y calificación de colaboradores. La gestión de usuarios es importante pero secundaria.
 
Plataformas: Android, iOS y web.
 
## 2. Reglas de negocio
 
1. **Visibilidad del usuario cliente.** Una tarea es visible para un usuario cliente si figura en ella o si pertenece a su empresa cliente actual. Al asociarlo a una empresa cliente ve el historial de tareas de esa empresa. Si lo desasocian, pierde ese acceso. La visibilidad se calcula al consultar, no se copian datos.
2. **Destinatario de la tarea obligatorio.** Toda tarea tiene al menos una empresa cliente o un usuario cliente (restricción en base de datos).
3. **Tareas anteriores de un usuario cliente sin empresa cliente.** Cuando el usuario cliente se asocia a una empresa cliente, sus tareas anteriores no pasan a la empresa. Conservan su vínculo original, para no cambiar retroactivamente quién ve qué ni el historial de envíos y auditoría. Mover una tarea a una empresa cliente a mano queda fuera del MVP.
4. **Destinatario del PDF (solo mail).** Al finalizar la tarea, el mail va al del usuario cliente de la tarea. Si no tiene, al de la empresa cliente de la tarea. Si no hay ninguno, no se envía. Si el usuario cliente no tiene empresa cliente, no hay alternativa. El resultado (enviado u omitido por falta de contacto) queda en el registro de envíos. Los teléfonos son datos de contacto informativos.
5. **Envío automático.** El colaborador no envía nada aparte: al finalizar la tarea el sistema genera el PDF y manda el mail solo, en segundo plano.
6. **Plazo de descargos configurable por empresa cliente.** Los descargos y las calificaciones se aceptan hasta un plazo que se configura en cada empresa cliente. Valor por defecto: 14 días (336 horas exactas desde la finalización de la tarea). Si el usuario cliente no tiene empresa cliente, rige el valor por defecto de la empresa proveedora de servicios. Al finalizar la tarea, el servidor calcula y guarda `descargos_hasta` con el valor vigente en ese momento, así que cambiar la configuración después no altera las tareas ya finalizadas. Como el colaborador puede cerrar sin conexión, se guarda la hora del dispositivo y la hora de recepción en el servidor, y se corrige el desfase del reloj al sincronizar. El estado "cerrada" se deduce de esa fecha, no requiere job.
7. **Descargo.** Es un solo descargo por tarea. Se agrega a la tarea sin tocar el registro original, que sigue inmutable. Cualquier descargo, sea observación o reclamo, pasa la tarea al estado **Descargo realizado** y aparece en el inicio del panel de gestión. Lo gestiona el administrador (abierto, en gestión, resuelto).
8. **Calificación de colaboradores.** Reemplaza al feedback en Google Maps. No se envía ningún mensaje pidiendo valoración. El usuario cliente califica a cada colaborador que realizó el servicio, solo desde la app y solo en tareas finalizadas. Escala de 1 a 5 estrellas con comentario opcional. Una calificación por colaborador por tarea, editable mientras el plazo de descargos esté abierto. Solo la ve el administrador, junto con el promedio por colaborador en el panel de gestión.
9. **Varios colaboradores por tarea.** Cada colaborador registra su propia llegada y tiene su propio importe. El costo de la tarea es único. Hay un único registro por tarea: lo completa el colaborador que finaliza la tarea (cualquiera de los asignados; si dos intentan, gana el primero) y los demás lo ven en solo lectura.
10. **Registro inmutable.** Una vez finalizada la tarea, el registro no se edita. Mitigación: borrador autoguardado y pantalla de confirmación con resumen antes de finalizar.
11. **Demora.** Un booleano `demora_en_atender`. Sin minutos ni cálculo de horas trabajadas. Llegada y finalización son timestamps informativos.
12. **Sin geolocalización.** La dirección es solo informativa. "Cómo llegar" es un link de Google Maps armado con el texto de la dirección (sin API ni costo). Se quita el GPS de los metadatos de las fotos.
13. **Costos e importes.** Costo de la tarea e importe del colaborador en UYU, informativos, sin IVA ni liquidación. Los ve solo el administrador. El colaborador no ve costos ni importes.
14. **Baja de colaborador.** Baja lógica (inactivo), nunca borrado físico. Si tiene tareas programadas o en curso, el panel de gestión muestra una alerta con la lista y permite reasignarlas a otro colaborador activo. Si no hay otro, ofrece crearlo en el momento. Con varios colaboradores en una tarea, solo se reemplaza su asignación. Se invalidan sus sesiones. Un colaborador reemplazado deja de ser calificable en esa tarea.
15. **Sin firma** de la persona encargada de recibir al colaborador.
16. **Retención.** Fotos originales y thumbnails se borran a los 6 meses (180 días). Los PDF son permanentes y llevan las fotos embebidas en tamaño reducido, así que la evidencia visual sobrevive dentro del PDF. La app muestra "foto expirada" en lugar de una imagen rota.
17. **Texto del registro:** negrita y bullets. **Fotos:** máximo 25 por registro, validado en la app y en el backend.
## 3. Roles y permisos
 
- **Administrador:** todo dentro de su empresa proveedora de servicios. Alta, baja y modificación de usuarios y empresas cliente (incluido el plazo de descargos de cada empresa cliente), tareas, tipos de servicio, descargos, reenvío de PDF, calificaciones, y filtros por empresa cliente, colaborador, usuario cliente y tipo de servicio. El inicio del panel de gestión muestra primero los descargos abiertos, ordenados por antigüedad, con acciones de contacto rápido.
- **Colaborador:** solo ve sus tareas asignadas. Registra su llegada y finaliza tareas. No ve costos, importes ni calificaciones.
- **Usuario cliente:** ve las tareas que le corresponden (regla 1) y su PDF. Dentro del plazo de descargos puede presentar un descargo y calificar a los colaboradores del servicio.
Los permisos se aplican en la API y con RLS en Postgres. Todas las tablas llevan `organization_id`, que identifica a la empresa proveedora de servicios.
 
## 4. Modelo de datos
 
| Tabla | Campos clave |
|---|---|
| `organizations` (empresa proveedora de servicios) | nombre, logo, zona horaria, plazo de descargos por defecto (336 h) |
| `users` | organization_id, rol (administrador, colaborador, usuario cliente), email, teléfono, estado, client_company_id (nullable) |
| `client_companies` (empresa cliente) | razón social, dirección (texto), teléfono, email, contactos, observaciones editables, ventana_descargos_horas (nullable, usa el valor por defecto si está vacío) |
| `service_types` | nombre, activo |
| `tasks` | client_company_id y client_user_id (al menos uno), dirección (copia al momento de crear), persona encargada de recibir (texto, opcional), inicio pautado, horas asignadas (opcional), descripción, indicaciones (opcional), service_type_id (opcional), costo_uyu, estado, finalizada_en, recibida_en, descargos_hasta |
| `task_assignments` | task_id, collaborator_id, importe_colaborador_uyu (opcional), llegada_en, demora_en_atender, activa (false si fue reemplazada) |
| `task_reports` (registro de la tarea) | task_id (único), contenido enriquecido (JSON y HTML sanitizado), finalizado_por, finalizada_en (dispositivo), recibida_en (servidor) |
| `task_photos` | task_id, clave original, clave thumbnail, bytes, sha256, estado (subiendo, enviada, expirada), expira_en |
| `documents` | task_id, clave del PDF, hash, generado_en |
| `descargos` | task_id (único), autor (usuario cliente), descripción, estado (abierto, en gestión, resuelto), notas internas, creado_en |
| `task_ratings` | task_assignment_id, autor (usuario cliente), estrellas (1 a 5), comentario (opcional), creado_en, editado_en |
| `notifications_outbox` | canal (mail, push), destinatario resuelto, estado (enviado, fallido, omitido sin contacto), intentos, error |
| `audit_log` | actor, entidad, acción, antes y después, timestamp |
 
La dirección de la tarea se guarda como copia para que un cambio posterior en la empresa cliente no altere el historial.
 
## 5. Estados de la tarea
 
`programada` pasa a `en_sitio` (primera llegada de un colaborador registrada), luego a `finalizada` (tarea finalizada, registro enviado). Desde `finalizada`, dentro del plazo de descargos, el usuario cliente puede presentar un descargo y la tarea pasa a `descargo_realizado` (se muestra como "Descargo realizado"). Después el administrador la lleva a `en_gestión` y `resuelta`. También existe `cancelada`. "Cerrada" se deduce: tarea finalizada, sin descargo y con `descargos_hasta` vencido. Toda transición la hace el backend y queda en el `audit_log`. Generar el PDF y enviar el mail son procesos asincrónicos disparados por la finalización de la tarea.
 
## 6. Conectividad pobre
 
Patrón de cola local: la llegada y el registro de la tarea se guardan primero en SQLite en el dispositivo con un UUID, y se sincronizan con reintentos. Los endpoints son idempotentes por UUID. Las fotos suben una a una directo al storage con URLs prefirmadas. Cuando están todas confirmadas, la tarea pasa a finalizada. La app muestra "guardado en el teléfono, enviando 7/12" y nunca bloquea al colaborador.
 
## 7. Stack
 
| Capa | Elección |
|---|---|
| App móvil y web de colaborador y usuario cliente | Expo (React Native) + Expo Router + TypeScript |
| Panel de gestión del administrador | React + Vite + TanStack Query/Table + Tiptap |
| Editor enriquecido móvil | 10tap (Tiptap), requiere development build |
| Backend | Node.js 22 + Fastify + zod |
| Base de datos | Postgres en Supabase + Drizzle |
| Autenticación | Supabase Auth (email y contraseña, magic link) |
| Fotos y PDF | Cloudflare R2 con URLs prefirmadas y regla de ciclo de vida |
| Generación de PDF | @react-pdf/renderer en un worker Node |
| Mail | Resend |
| Cola de procesos | pg-boss sobre Postgres |
| Notificaciones push | Expo Push (FCM y APNs) |
| CI/CD | GitHub Actions + EAS |
 
Decisiones explícitas: sin Sentry y sin Google Maps API. Los errores se revisan en los logs del hosting.
 
Estructura: monorepo pnpm con `apps/mobile`, `apps/panel`, `apps/api` y `packages/shared` (tipos, zod, cliente API).
 
React Native (Expo) sobre Flutter por: mismo lenguaje que el panel de gestión, código compartido, builds de iOS en la nube sin Mac y editor enriquecido con el mismo formato en móvil y web. Una PWA sola se descarta por las limitaciones de iOS con push y subidas en segundo plano.
 
## 8. Costos
 
Supuestos: 20 empresas cliente, 60 usuarios cliente, 2 colaboradores, 30 tareas por colaborador por mes (60 tareas, 600 fotos por mes), unos 100 mails por mes.
 
### 8.1 Servicios
 
| Servicio | Plan | Costo |
|---|---|---|
| Expo (framework, EAS Build, EAS Update, push) | Gratis: 15 builds Android y 15 iOS por mes en cola de baja prioridad, 1.000 usuarios activos de actualizaciones | USD 0 |
| Cloudflare R2 (fotos y PDF) | 10 GB gratis, descarga gratis | USD 0 |
| Resend | 3.000 mails por mes gratis (tope de 100 por día) | USD 0 |
| Panel de gestión web | Hosting estático gratis (Cloudflare Pages o Render) | USD 0 |
| Push, PDF, cola de procesos | Gratis / open source | USD 0 |
| Backend Node en Render | Starter, siempre encendido (el gratis tarda cerca de 1 minuto en despertar) | USD 7 por mes |
| Base de datos y autenticación | Opción mínima: Supabase Free con consulta periódica y backup nocturno a R2. Opción recomendada: Supabase Pro | USD 0 o USD 25 por mes |
| Dominio | .uy USD 9,90 más IVA por año (revendedor); .com unos USD 26 más IVA por año | USD 12,08 por año |
| Apple Developer Program | Anual | USD 99 por año |
| Google Play | Pago único | USD 25 |
 
Expo no hace falta pagarlo. El framework es gratuito. Solo se pagaría el plan de EAS (USD 19 por mes) si superás los 15 builds por mes, necesitás cola prioritaria o pasás los 1.000 usuarios activos de actualizaciones.
 
### 8.2 Costo mensual detallado
 
| Concepto | Mínimo (Supabase Free) | Recomendado (Supabase Pro) |
|---|---|---|
| Render Starter (backend) | 7,00 | 7,00 |
| Supabase (base de datos y autenticación) | 0,00 | 25,00 |
| Cloudflare R2 | 0,00 | 0,00 |
| Resend (mails) | 0,00 | 0,00 |
| Expo / EAS | 0,00 | 0,00 |
| Panel de gestión web y push | 0,00 | 0,00 |
| Apple Developer (99 dividido 12) | 8,25 | 8,25 |
| Dominio .uy (12,08 dividido 12) | 1,01 | 1,01 |
| **Total mensual prorrateado** | **16,26** | **41,26** |
| De eso, lo que se factura cada mes | 7,00 | 32,00 |
 
### 8.3 Costo anual detallado
 
| Concepto | Mínimo | Recomendado |
|---|---|---|
| Render Starter (7 por 12) | 84,00 | 84,00 |
| Supabase Pro (25 por 12) | 0,00 | 300,00 |
| R2, Resend, Expo, panel de gestión web, push | 0,00 | 0,00 |
| Apple Developer | 99,00 | 99,00 |
| Dominio .uy | 12,08 | 12,08 |
| **Total años siguientes** | **195,08** | **495,08** |
| Google Play (pago único, solo año 1) | 25,00 | 25,00 |
| **Total año 1** | **220,08** | **520,08** |
 
Peor caso con IVA del 22% sobre Render y Supabase (servicios del exterior): mínimo 238,56 el año 1 y 213,56 los siguientes; recomendado 604,56 el año 1 y 579,56 los siguientes. Confirmalo con tu contador.
 
Por plataforma (año 1): Android USD 25 una vez. iOS USD 99 por año. Web USD 12,08 de dominio, con hosting estático gratis. El backend compartido cuesta USD 84 por año (Render), más USD 300 si se elige Supabase Pro.
 
Durante el desarrollo el hosting es USD 0 (capas gratuitas). Las cuentas de Apple y Google se pagan cuando se quiere empezar a probar con testers.
 
Cuándo se empieza a pagar de más: Resend a partir de 100 mails por día o 3.000 por mes (USD 20 por mes), R2 al pasar los 10 GB (USD 0,015 por GB-mes), EAS al pasar los límites mencionados (USD 19 por mes). Con el volumen del escenario no pasa nada de eso.
 
### 8.4 Riesgos de la opción mínima
 
Supabase Free pausa el proyecto tras una semana sin actividad y no incluye backups. Mitigación: un proceso programado que haga una consulta diaria, y un `pg_dump` nocturno a R2 con GitHub Actions. No tiene soporte ni garantía de disponibilidad. Conviene pasar a Pro cuando la app tenga usuarios reales en producción.
 
### 8.5 Almacenamiento con retención de 6 meses
 
Con fotos comprimidas a 600 KB: originales unos 360 MB por mes, que se estabilizan en unos 2,2 GB. Los PDF (unos 1,5 MB cada uno) acumulan unos 1,1 GB por año. El primer año termina en unos 3,3 GB y recién después de 6 o 7 años se pasan los 10 GB gratis. Con fotos de 1 MB serían unos 6 años. A 5 veces el volumen se pasan los 10 GB, pero el costo sería menor a USD 1 por mes.
 
Compresión en el dispositivo: lado largo a 1600 px, JPEG calidad 0,7, thumbnail de 320 px, y una versión de 1024 px para el PDF.
 
## 9. Publicación
 
- **Google Play:** si la cuenta es personal y fue creada después del 13/11/2023, exige una prueba cerrada con al menos 12 testers durante 14 días seguidos antes de pasar a producción. Una cuenta de organización (con número D-U-N-S) está exenta. Abrir la prueba cerrada apenas haya un primer build.
- **App Store:** revisión de 1 a 3 días por envío. Cuenta demo en las notas de revisión. Evaluar distribución no listada, porque los usuarios los da de alta el administrador.
- **Ambas tiendas:** política de privacidad pública y formularios de datos. Para Apple y Google hace falta tarjeta internacional.
- **Uruguay:** revisar con un abogado la Ley 18.331 de datos personales (fotos con personas, teléfonos) y la inscripción de bases ante la URCDP.
## 10. Esfuerzo estimado
 
Un desarrollador full stack, 40 horas por semana: MVP de unas 405 a 555 horas, o sea 10 a 14 semanas. La versión completa (calendario, importación CSV, tests E2E, plantilla de PDF por empresa proveedora de servicios) suma unas 210 horas más. Estimación sin diseño de marca ni tiempos de espera de las tiendas.
 
## 11. Riesgos
 
1. Regla de 12 testers de Google Play si la cuenta es personal.
2. Subidas fallidas con mala señal: la cola local y la idempotencia son parte del núcleo.
3. Supabase Free: pausa y falta de backups (ver 8.4).
4. Privacidad: fotos con personas y teléfonos.
5. Mail como único canal hacia el usuario cliente: configurar SPF y DKIM del dominio en Resend para que el PDF no caiga en spam, y mostrar el PDF también en la app del usuario cliente.
## 12. Siguientes pasos
 
1. Crear cuentas: Apple Developer, Google Play (idealmente como organización), Cloudflare R2, Resend con dominio verificado.
2. Spike técnico de una semana: Expo, editor 10tap, selección de 25 fotos, compresión y subida a R2 con y sin conexión, en un Android de gama baja.
3. Abrir la prueba cerrada con 12 testers reales apenas haya un primer build.
4. Desarrollar con capas gratuitas y pasar a Render Starter cuando haya usuarios real