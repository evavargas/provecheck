# ProveCheck

ProveCheck es un sistema de gestión de servicios en terreno para empresas que prestan servicios (limpieza, mantenimiento, control de plagas y similares). Reemplaza las planillas, los mensajes sueltos y las fotos desordenadas por un registro formal: se asigna una tarea a uno o más colaboradores, cada uno registra su llegada, hace el servicio, lo cierra con evidencia (texto y fotos) y el sistema genera un PDF que le llega por mail al cliente. El cliente puede presentar un descargo y calificar a quienes lo atendieron.

## Qué podés hacer

**Administrador** (panel web)
- **Crear y asignar tareas** a uno o más colaboradores, con fecha, indicaciones, persona que recibe y costos. Toda tarea tiene al menos un colaborador, y se puede reasignar o cancelar mientras no empezó.
- **Gestionar usuarios, empresas cliente y tipos de servicio.** Dar de baja a un colaborador con tareas pendientes pide elegir un reemplazo para cada una.
- **Ver el resultado de cada servicio**: el registro, las fotos, el PDF, y si el mail llegó (con opción de reenviarlo a otra dirección).
- **Atender descargos**: ver el texto y las imágenes del cliente, cambiar su estado y dejar notas internas que el cliente nunca ve.
- **Ver calificaciones** con promedio y distribución por colaborador, y una **auditoría** de quién cambió qué.
- **Configurar** el nombre, el logo (sale en el PDF), la zona horaria, el idioma y el plazo de descargos por defecto.

**Colaborador** (app)
- Ver sus tareas de hoy y las próximas, con cómo llegar y la llamada al cliente.
- Registrar la llegada, escribir el registro (con negrita y listas), sumar hasta 25 fotos y finalizar.

**Usuario cliente** (app)
- Ver sus servicios (también los cancelados), el registro con fotos y el PDF.
- Presentar un descargo con hasta 5 imágenes mientras corre el plazo, y calificar a cada colaborador.

Todo está en español e inglés, con modo claro y oscuro. Las fechas siempre se muestran como dd/mm/aaaa. Los usuarios no tienen foto ni avatar. Necesita conexión a internet.

## Dónde se usa

- **Panel de administración**: [provecheck-panel.vercel.app](https://provecheck-panel.vercel.app).
- **Web para colaboradores y clientes**: [provecheck-app.vercel.app](https://provecheck-app.vercel.app).
- **Celular (Android)**: la misma app que la web. **[Descargar el APK](https://github.com/evavargas/provecheck/releases/latest/download/provecheck.apk)**. Al abrirlo, Android puede pedirte permiso para instalar apps desde ese origen: aceptalo solo para esta instalación. No está en las tiendas de aplicaciones.

Las cuentas las crea el administrador: no hay registro público. Cada persona recibe una contraseña temporal y la cambia en su primer ingreso. El servidor corre en un plan gratuito que se duerme tras 15 minutos sin uso: la primera visita puede tardar hasta un minuto en responder.

## Con qué está hecho

| Parte | Tecnología |
|---|---|
| Panel de administración | React, Vite, TanStack Query y Radix |
| App (celular y web) | Expo y React Native |
| Servidor | Node.js, Fastify y Zod |
| Base de datos, cuentas y archivos | Supabase (PostgreSQL, Auth y Storage) |
| PDF | `@react-pdf/renderer` |
| Envío de mails | Gmail (nodemailer) |
| Publicación | Render (servidor, con Docker) y Vercel (panel y web) |
| Código compartido | Monorepo con pnpm: esquemas, textos, temas y cliente de API en un solo paquete |

## Cómo funciona por dentro

- **Aislamiento por organización y por rol en la base de datos.** Cada tabla tiene seguridad por filas: aunque el servidor tuviera un error, una persona solo accede a lo que le corresponde.
- **Los costos nunca llegan a colaboradores ni clientes.** Cada rol recibe su propia vista de los datos, y hay tests que buscan campos de costos en las respuestas.
- **Reglas importantes dentro de la base.** Presentar un descargo (una sola vez, dentro del plazo, con sus imágenes) es una función de la base de datos que lo valida todo de forma atómica. El plazo lo mide el reloj del servidor, no el del teléfono.
- **Un solo registro por tarea.** Si dos colaboradores intentan finalizar a la vez, gana el primero, y el registro no se puede editar después.
- **Trabajos en segundo plano sin servicios extra.** Una cola en PostgreSQL, que corre dentro del servidor, genera el PDF y envía el mail con reintentos. Cada día borra las fotos vencidas (a los 180 días) y limpia las subidas que quedaron sin usar.
- **Archivos privados.** Las fotos y los PDF viven en un bucket privado y solo se ven con enlaces firmados de corta duración.
- **Cuentas.** El servidor usa Supabase Auth solo para sesiones y las contraseñas; el login no revela si un usuario existe y limita los intentos.
- **Pruebas.** Más de 70 pruebas de integración contra una base real (permisos, reglas de negocio, trabajos, PDF y mails) y un script de pruebas de seguridad por filas.

## Cómo lo construí con IA

ProveCheck se desarrolló con desarrollo asistido por IA (Claude Code). El trabajo se apoya en documentos dentro del repo en lugar de en prompts sueltos:

- [docs/provecheck-documentacion-desarrollo.md](docs/provecheck-documentacion-desarrollo.md) es la especificación funcional: reglas de negocio, pantallas y flujos. Si algo contradice a otro documento, gana este.
- [docs/provecheck-especificacion-tecnica.md](docs/provecheck-especificacion-tecnica.md) define la arquitectura y las decisiones técnicas.
- [CLAUDE.md](CLAUDE.md) reúne los comandos y las reglas que no se negocian (todo el código en inglés, sin textos fijos en la interfaz, secretos fuera del repo).
- Las pruebas verifican cada regla de negocio después de cada cambio.

La idea: yo decido producto, diseño y límites; la IA acelera la implementación, y las reglas escritas y las pruebas mantienen el resultado consistente.

## Para quienes desarrollan

```
pnpm install
supabase start          # necesita Docker
cp .env.example .env    # completar con los valores de `supabase status`
pnpm --filter api dev
pnpm --filter panel dev
pnpm --filter mobile start
```

- Comandos y reglas del proyecto: [CLAUDE.md](CLAUDE.md)
- Cómo publicar el sistema: [DEPLOY.md](DEPLOY.md)
- Especificación funcional y técnica: [docs/](docs)
