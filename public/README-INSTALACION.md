# Agenda del Grupo · instalación en Railway

Esta es la versión real: servidor Node + base de datos SQLite, inicio de sesión, invitaciones por enlace,
correo, avisos al celular (push), recordatorios automáticos (funcionan con la app cerrada) y app instalable (PWA).

Tiempo estimado: 20 a 30 minutos la primera vez.

---

## 1. Subir el proyecto a GitHub

1. Descomprime `agenda-grupo.zip`. Verás esto:
   ```
   agenda-grupo/
     package.json
     .node-version
     .gitignore
     .env.example
     README-INSTALACION.md
     server/   (index.js, db.js, auth.js, notify.js)
     public/   (index.html, app.js, entrar.html, configurar.html, invitacion.html, sw.js, manifest.webmanifest, iconos/)
   ```
2. En github.com crea un repositorio nuevo, por ejemplo **agenda-grupo** (puede ser **privado**).
3. En el repositorio: **Add file → Upload files**. Arrastra **todo el contenido** de la carpeta `agenda-grupo`
   (los archivos sueltos y las carpetas `server` y `public`). En Chrome puedes arrastrar carpetas completas.
4. Pulsa **Commit changes**. Revisa que arriba se vean `package.json`, `server/` y `public/`.

> No subas la carpeta `node_modules` ni `data` (no vienen en el zip; Railway las crea).

## 2. Crear el servicio en Railway

1. Entra a railway.app → **New Project → Deploy from GitHub repo** → elige `agenda-grupo`.
2. Railway detecta Node y empieza a construir. Espera a que el primer despliegue termine (1 a 3 minutos).
3. **Volumen (obligatorio, para no perder los datos):** entra al servicio → pestaña **Settings** → sección **Volumes**
   → **Add Volume** → en *Mount path* escribe `/data` → guarda.
4. **Variables:** pestaña **Variables** → agrega:

   | Variable | Valor |
   |---|---|
   | `DATA_DIR` | `/data` |
   | `TZ` | `America/Bogota` |

5. **Dominio:** pestaña **Settings → Networking → Generate Domain**. Te da una dirección tipo
   `https://agenda-grupo-production.up.railway.app`. Cópiala y agrégala como variable:

   | Variable | Valor |
   |---|---|
   | `APP_URL` | `https://TU-DOMINIO.up.railway.app` (sin barra al final) |

6. Railway vuelve a desplegar solo al guardar variables. Cuando termine, abre tu dominio.

## 3. Primer ingreso

1. Al abrir la dirección por primera vez aparece **Primer ingreso**: escribe tu nombre, tu correo y una contraseña
   (mínimo 8 caracteres). Ese es el administrador general. Solo se hace una vez.
2. Entras a la plataforma con el equipo ya cargado (Alex Rojas, Andrés Felipe, Sebastián Beltrán, Jerson González,
   Alex Rodríguez) en estado "Sin invitar todavía".

## 4. Invitar al equipo

1. Ve a **Directorio** → en cada persona pulsa **Editar** para ponerle su correo (opcional pero recomendado).
2. Pulsa **Enviar invitación**. Aparece un panel con el **enlace de acceso** (vence en 7 días):
   - Si el correo está configurado (paso 5), se envía automáticamente.
   - Si no, pulsa **Enviar por WhatsApp** o **Copiar enlace** y mándaselo tú.
3. La persona abre el enlace, revisa su nombre, escribe su correo y crea su contraseña. Queda dentro de una vez.
4. Para agregar más personas: **Directorio → + Invitar persona**.
5. Si alguien olvida la contraseña: **Directorio → Enlace de acceso** (le genera uno nuevo).

## 5. Activar el correo (recomendado)

Se configura **desde la misma plataforma**, sin tocar Railway:

1. Entra como administrador → **Directorio** → **Estado de canales** → **Configurar correo**.
2. El panel te guía: con la cuenta de Gmail que va a enviar los correos, activa la **Verificación en 2 pasos**
   y crea una **Contraseña de aplicación** (Google te da una clave de 16 letras).
3. Escribe la cuenta de Gmail y pega la clave → **Guardar y probar**. La plataforma prueba la conexión, la guarda
   y te envía un correo de prueba. Desde ahí, invitaciones y avisos también salen por correo.
4. Si usas otro proveedor (Brevo, Outlook, tu dominio), abre "Uso otro proveedor" y escribe servidor y puerto.

También puedes fijarlo con variables en Railway (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`);
si existen, mandan sobre lo configurado en la plataforma.

## 5b. Empresas

**Directorio → Empresas**: el administrador puede agregar empresas nuevas, cambiarles el nombre y el color, y eliminar
las que no tengan actividades. Luego asigna cada empresa a las personas con **Editar**.

## 6. Avisos al celular (push)

No hay nada que configurar en el servidor: la clave se genera sola la primera vez y queda guardada en el volumen.

Cada persona los activa desde su celular:
- **Android (Chrome):** abre la plataforma → Inicio muestra "Activar avisos" (o Ajustes de avisos → Activar) → Permitir.
  Opcional: menú ⋮ → **Instalar app** para tenerla en la pantalla de inicio.
- **iPhone (Safari):** primero **Compartir → Agregar a pantalla de inicio**, abrir la app desde el ícono y ahí
  **Ajustes de avisos → Activar**. En iPhone los avisos solo funcionan desde la app instalada (iOS 16.4 o superior).

## 7. Qué hace el servidor por sí solo

- Recordatorios de citas: 1 día, 2 horas y 15 minutos antes (ajustables en Directorio para el equipo o por actividad).
- Recordatorios de tareas: un día antes de la entrega y cuando vence sin completarse.
- Aviso al responsable cuando faltan confirmaciones a menos de 24 horas.
- Aviso a coordinadores y administrador cuando una tarea lleva 2 días o más de retraso.
- Resumen diario por persona a la hora que cada quien elija (por defecto 7:00 a. m.).
- Respeta el horario de descanso de cada persona (los avisos de 15 minutos antes siempre llegan).
- Reintenta los envíos que fallen (3 intentos) y deja registro en **Directorio → Registro de envíos**.

## 8. Actualizar a una versión nueva

Cuando te entregue una versión nueva: sube los archivos cambiados al repositorio (Add file → Upload files, reemplaza
los existentes) y haz commit. Railway despliega solo. Los datos no se pierden porque viven en el volumen `/data`.

## 9. Si algo no funciona

- **Pantalla "Primer ingreso" aparece de nuevo o se borró todo:** falta el volumen en `/data` o la variable `DATA_DIR`.
- **Los correos no salen:** Directorio → Estado de canales dice qué falta. Con Gmail, revisa que la clave sea la de
  aplicación (16 letras), no tu contraseña normal.
- **Los enlaces de los correos apuntan a una dirección rara:** revisa `APP_URL`.
- **Los avisos al celular no llegan:** la persona debe tener el celular activado (Ajustes de avisos) y, en iPhone,
  la app instalada. Revisa que el dominio sea `https://` (Railway ya lo es).
- **Revisar el servidor:** en Railway → pestaña **Deployments → View logs**. Al arrancar imprime el estado del correo
  y del push.

## Variables (resumen)

| Variable | Obligatoria | Para qué |
|---|---|---|
| `DATA_DIR` | sí (`/data`) | Dónde guarda la base de datos y los archivos adjuntos |
| `APP_URL` | recomendada | Dirección pública, usada en los enlaces de correos y avisos |
| `TZ` | recomendada (`America/Bogota`) | Zona horaria del servidor |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | para correo | Envío de correos |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | no | Solo si quieres fijar tus propias claves push |
| `PORT` | no | Railway la pone sola |
