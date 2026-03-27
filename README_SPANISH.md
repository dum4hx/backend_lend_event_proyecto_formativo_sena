# LendEvent API

API Backend para la plataforma de gestión de alquiler de equipos para eventos LendEvent. Un sistema multi-tenant completo para gestionar operaciones de alquiler de equipos, incluyendo gestión de inventario, solicitudes de préstamo, aprobaciones, facturación y procesamiento de pagos con integración de Stripe.

## Características

- 🔐 **Autenticación Segura** - JWT con cookies HttpOnly y firma RSA
- 🏢 **Arquitectura Multi-Tenant** - Aislamiento completo de datos por organización
- 👥 **Control de Acceso Basado en Roles** - 55+ permisos granulares
- 📦 **Gestión de Inventario** - Categorías, tipos e instancias individuales de materiales
- 📝 **Flujo de Solicitud de Préstamos** - Solicitud → Aprobación → Asignación → Entrega → Devolución
- 💰 **Facturación y Cobros** - Facturación automatizada con integración de Stripe
- 🔍 **Inspecciones** - Inspecciones de entrega y devolución con seguimiento de daños
- 📊 **Gestión de Suscripciones** - Múltiples planes con límites configurables
- 🧪 **Testing Completo** - Tests E2E de API con Playwright

## Stack Tecnológico

- **Runtime:** Node.js 22+
- **Lenguaje:** TypeScript 5.9
- **Framework:** Express 5
- **Base de datos:** MongoDB (Mongoose 9)
- **Autenticación:** JWT con cookies HttpOnly
- **Pagos:** Stripe
- **Testing:** Playwright

## Requisitos Previos

Antes de comenzar, asegúrate de tener instalado lo siguiente:

- **[Node.js 22+](https://nodejs.org/)** - Entorno de ejecución JavaScript (incluye npm)
- **[MongoDB](https://www.mongodb.com/)** - Base de datos NoSQL (instalación local o nube con Atlas)
- **[Nginx](https://nginx.org/)** - Servidor web para proxy HTTPS local (opcional, para testing con HTTPS)
- **[mkcert](https://github.com/FiloSottile/mkcert)** - Herramienta para generar certificados SSL locales (opcional, para HTTPS)

> **Nota:** Nginx y mkcert son opcionales para desarrollo básico. Puedes ejecutar la API directamente en `http://localhost:8080` sin ellos.

## Inicio Rápido

### 1. Clonar el Repositorio

```bash
git clone https://github.com/dum4hx/backend_lend_event_proyecto_formativo_sena.git backend_repository
cd backend_repository
```

### 2. Instalar Dependencias

```bash
npm install
```

### 3. Configurar Variables de Entorno

Copia el archivo de ejemplo y configúralo:

```bash
cp .env.example .env
```

Edita `.env` con tus valores. Aquí están las variables esenciales:

```dotenv
PORT=8080

# Base de datos
# Para MongoDB local:
DB_CONNECTION_STRING=mongodb://localhost:27017/lendevent
# Para MongoDB Atlas (nube):
# DB_CONNECTION_STRING=mongodb+srv://usuario:contraseña@cluster.mongodb.net/lendevent

# Configuración JWT (firma asimétrica RSA)
JWT_ASYMMETRIC_KEY_ALG='RS256'
JWT_ENC='A256GCM'
JWT_ISSUER='https://api.test.local/'
JWT_AUDIENCE='https://app.test.local/'

# Dominio de cookies (debe coincidir con tu dominio local o usar 'localhost' para desarrollo local)
COOKIE_DOMAIN=test.local

# Stripe (obtén las claves desde https://dashboard.stripe.com/apikeys)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Configuración de Email SMTP (para restablecimiento de contraseña, invitaciones, etc.)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu_email@gmail.com
SMTP_PASS=tu_contraseña_de_aplicacion
SMTP_FROM=noreply@tudominio.com

# Credenciales de Super Admin (para seeding inicial)
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=TuContraseñaSegura123!

# CORS (orígenes frontend permitidos, separados por comas)
CORS_ORIGIN=https://app.test.local,http://localhost:3000

# Entorno
NODE_ENV=development
SKIP_SUBSCRIPTION_CHECK=false
```

> **Importante:** 
> - Nunca hagas commit del archivo `.env` al control de versiones (ya está en `.gitignore`)
> - Para Gmail SMTP, necesitas generar una "Contraseña de aplicación" en la configuración de seguridad de tu cuenta de Google
> - Usa contraseñas fuertes para `INITIAL_ADMIN_PASSWORD` (mín 8 caracteres, mayúsculas, minúsculas, números, símbolos)

### 4. Generar Claves JWT

Genera el par de claves RSA para firmar JWT:

```bash
npm run generate-keys
```

Esto crea los archivos de claves en el directorio `keys/`.

### 5. Crear Usuario Super Admin Inicial (Opcional)

Crea la cuenta de super administrador de la plataforma:

1. Configura las credenciales del admin en tu archivo `.env`:

```dotenv
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=TuContraseñaSegura123!
```

2. Ejecuta el seeder:

```bash
npm run seed:admin
```

Esto crea:

- Una organización especial "Platform Administration"
- Un usuario super admin con acceso completo a la plataforma

**Nota:** Esta es una operación única. El seeder se saltará si ya existe un super admin con el email especificado.

### 6. Configurar Dominios Locales con Nginx

El proyecto usa dominios locales personalizados para desarrollo:

| Dominio          | Propósito                         |
| ---------------- | --------------------------------- |
| `app.test.local` | Aplicación web frontend           |
| `api.test.local` | API Backend (este proyecto)       |

#### 6.1 Agregar Entradas al Archivo Hosts

Agrega lo siguiente a tu archivo hosts:

**Windows:** `C:\Windows\System32\drivers\etc\hosts`  
**macOS/Linux:** `/etc/hosts`

```
127.0.0.1 app.test.local
127.0.0.1 api.test.local
```

#### 6.2 Generar Certificados SSL

Instala mkcert y genera los certificados:

```bash
# Instalar mkcert (Windows con Chocolatey)
choco install mkcert

# O en macOS con Homebrew
brew install mkcert

# Instalar la CA local
mkcert -install

# Generar certificados para ambos dominios
mkcert -cert-file api.test.local.pem -key-file api.test.local-key.pem api.test.local
mkcert -cert-file app.test.local.pem -key-file app.test.local-key.pem app.test.local
```

O usa el script proporcionado:

```bash
# PowerShell (Windows)
./scripts/generate-ssl.ps1

# Bash (macOS/Linux)
./scripts/generate-ssl.sh
```

#### 6.3 Configurar Nginx

Copia los certificados a tu directorio SSL de Nginx y usa la configuración proporcionada:

**Opción A: Docker (Recomendado)**

```bash
docker-compose up -d
```

Esto inicia Nginx con la configuración en `docker/nginx/nginx.conf`.

**Opción B: Instalación Local de Nginx**

1. Copia `docker/nginx/nginx.conf` a tu directorio de configuración de Nginx
2. Copia los certificados SSL a las rutas especificadas en la configuración
3. Actualiza el bloque `upstream backend` para apuntar a `localhost:8080`
4. Recarga Nginx:

```bash
# Windows
nginx -s reload

# macOS/Linux
sudo nginx -s reload
```

### 7. Iniciar el Servidor de Desarrollo

```bash
npm run dev
```

La API estará disponible en:

- **Directo:** `http://localhost:8080`
- **Vía Nginx:** `https://api.test.local`

### 8. Verificar la Configuración

Prueba el endpoint de salud:

```bash
curl https://api.test.local/health
```

Respuesta esperada:

```json
{
  "status": "success",
  "message": "Server running properly",
  "timestamp": "2026-02-09T...",
  "environment": "development"
}
```

## Scripts Disponibles

| Comando                 | Descripción                                   |
| ----------------------- | --------------------------------------------- |
| `npm run dev`           | Iniciar servidor de desarrollo con hot reload |
| `npm run build`         | Compilar TypeScript a JavaScript              |
| `npm start`             | Ejecutar build de producción compilado        |
| `npm run generate-keys` | Generar par de claves RSA para JWT            |
| `npm run seed:admin`    | Crear usuario super admin inicial             |
| `npm test`              | Ejecutar todos los tests de Playwright        |
| `npm run test:auth`     | Ejecutar tests de autenticación               |
| `npm run test:users`    | Ejecutar tests de gestión de usuarios         |
| `npm run test:ui`       | Abrir modo UI de Playwright                   |

## Estructura del Proyecto

El proyecto sigue una arquitectura modular con clara separación de responsabilidades:

```
src/
├── server.ts              # Punto de entrada - configuración de Express y middleware
├── errors/                # Clases de error personalizadas
│   └── AppError.ts        # Clase de error operacional con factory methods
├── middleware/            # Middleware de Express
│   ├── auth.ts            # Autenticación JWT y autorización RBAC
│   ├── rate_limiter.ts    # Limitación de tasa de requests (por IP/usuario)
│   ├── validation.ts      # Validación de schemas Zod
│   ├── error_logger.ts    # Logging de errores con Winston
│   └── error_responder.ts # Respuestas de error estandarizadas
├── modules/               # Módulos de funcionalidades (patrón Router → Service → Model)
│   ├── auth/              # Autenticación (registro, login, logout, refresh)
│   ├── billing/           # Facturación Stripe y webhooks
│   ├── customer/          # Gestión de clientes
│   ├── inspection/        # Inspecciones de materiales (entrega/devolución)
│   ├── invoice/           # Sistema de facturación
│   ├── loan/              # Préstamos de alquiler activos
│   ├── location/          # Ubicaciones físicas/almacenes
│   ├── material/          # Catálogo e inventario (categorías, tipos, instancias)
│   ├── organization/      # Organizaciones multi-tenant
│   ├── package/           # Paquetes de materiales (bundles)
│   ├── request/           # Solicitudes de préstamo (solicitud → aprobación → préstamo)
│   ├── roles/             # Roles y permisos RBAC
│   ├── subscription_type/ # Configuración de planes de suscripción
│   ├── super_admin/       # Análisis administrativos de la plataforma
│   ├── transfer/          # Transferencias de materiales entre ubicaciones
│   └── user/              # Gestión de usuarios
├── routers/               # Agregación de rutas Express
│   └── index.ts           # Exportación central de routers
├── scripts/               # Scripts de utilidad
│   ├── generate_keys.ts   # Generar pares de claves RSA para JWT
│   └── export_permissions_doc.ts # Generar documentación de permisos
└── utils/                 # Utilidades compartidas
    ├── auth/              # Helpers de firma y verificación JWT
    ├── db/                # Conexión a MongoDB
    │   └── connectDB.ts
    ├── logger.ts          # Configuración de logger Winston
    └── email.ts           # Servicio de email con Nodemailer
```

### Patrón de Módulos

Cada módulo sigue un patrón consistente:

- `*.router.ts` - Rutas HTTP, autenticación, verificación de permisos, validación
- `*.service.ts` - Lógica de negocio, consultas a BD, transformación de datos
- `models/` - Schemas de Mongoose y schemas de validación Zod

**Flujo de ejemplo:** Request → Router (validar) → Service (lógica de negocio) → Model (base de datos) → Response

## Documentación de la API

Ver [docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md) para la referencia completa de la API con todos los endpoints, ejemplos de request/response y códigos de error.

## Seguridad

### Autenticación

- **JWT con RSA (RS256)** - Firma asimétrica con pares de claves pública/privada
- **JWE (A256GCM)** - Tokens JWT encriptados para datos sensibles
- **Cookies HttpOnly** - Previene ataques XSS (tokens no accesibles vía JavaScript)
- **Access Token** - Expiración de 15 minutos
- **Refresh Token** - Expiración de 7 días (restringido solo a endpoints `/auth`)

### Autorización (RBAC)

- **55+ Permisos Granulares** - Formato: `resource:action` (ej: `materials:read`, `users:delete`)
- **Roles Personalizados por Organización** - Cada organización puede definir sus propios roles
- **Herencia de Permisos** - Roles del sistema (Owner, Admin) con permisos predefinidos
- **Verificaciones a Nivel de Request** - Cada endpoint protegido valida los permisos del usuario

### Medidas de Seguridad Adicionales

- **Hashing de Contraseñas con Argon2** - Más seguro que bcrypt
- **Helmet** - Establece headers HTTP seguros (CSP, HSTS, X-Frame-Options, etc.)
- **CORS** - Validación estricta de orígenes con soporte de credenciales
- **Rate Limiting** - Previene ataques de fuerza bruta (configurable por endpoint)
- **Validación de Inputs** - Validación de schema Zod para todas las solicitudes
- **Prevención de Inyección MongoDB** - Sanitización de queries con Mongoose
- **Aislamiento Multi-Tenant** - Todas las consultas limitadas por `organizationId`

## Testing

### Requisitos Previos para Testing

1. Asegúrate de que el servidor API esté ejecutándose
2. Configura `playwright.config.ts` con tu URL base

### Ejecutar Tests

```bash
# Ejecutar todos los tests
npm test

# Ejecutar suites de tests específicas
npm run test:auth
npm run test:users

# Modo UI interactivo
npm run test:ui
```

### Tests de Super Admin

Los tests de super admin requieren una cuenta super_admin pre-seeded. Configura mediante variables de entorno:

```bash
SUPER_ADMIN_EMAIL=superadmin@test.local
SUPER_ADMIN_PASSWORD=SuperAdmin123!
```

## Despliegue con Docker

### Desarrollo con Docker Compose

```bash
# Iniciar todos los servicios (API + Nginx)
docker-compose up -d

# Ver logs
docker-compose logs -f api

# Detener servicios
docker-compose down
```

### Build de Producción

```bash
# Construir la imagen Docker
docker build -t lendevent-api .

# Ejecutar el contenedor
docker run -p 8080:8080 --env-file .env lendevent-api
```

**Características de la Imagen Docker:**
- Build multi-etapa (tamaño de imagen reducido)
- Usuario no-root para seguridad
- Endpoint de health check
- Optimización de cache de capas

## Despliegue en Producción

### Configuración del Entorno

1. **Usar Variables de Entorno** - Nunca uses archivos `.env` en producción. Usa la gestión de variables de entorno de tu proveedor de hosting.

2. **Variables Requeridas para Producción:**
   ```bash
   NODE_ENV=production
   DB_CONNECTION_STRING=<uri-mongodb-atlas>
   JWT_ISSUER=https://api.tudominio.com/
   JWT_AUDIENCE=https://app.tudominio.com/
   COOKIE_DOMAIN=tudominio.com
   CORS_ORIGIN=https://app.tudominio.com
   STRIPE_SECRET_KEY=<clave-live>
   STRIPE_WEBHOOK_SECRET=<webhook-secret-live>
   ```

3. **Lista de Verificación de Seguridad:**
   - ✅ Usar HTTPS (cookies con flag `secure`)
   - ✅ Configurar whitelist de IPs en MongoDB Atlas
   - ✅ Rotar claves JWT regularmente
   - ✅ Habilitar rate limiting
   - ✅ Configurar monitoreo y alertas
   - ✅ Configurar CORS solo para dominios específicos
   - ✅ Usar contraseñas fuertes para todas las cuentas
   - ✅ Habilitar autenticación de MongoDB
   - ✅ Configurar backups automáticos

### Opciones de Hosting Recomendadas

- **Hosting de API:** Heroku, Railway, Render, DigitalOcean App Platform, AWS ECS
- **Base de Datos:** MongoDB Atlas (gestionado, backups automáticos, escalabilidad)
- **Monitoreo:** New Relic, Datadog, o logs integrados con Winston

### Gestión de Procesos

Para producción sin Docker, usa un gestor de procesos:

```bash
# Instalar PM2
npm install -g pm2

# Iniciar la API
pm2 start dist/server.js --name lendevent-api

# Ver logs
pm2 logs lendevent-api

# Monitorear
pm2 monit

# Auto-reinicio al reiniciar
pm2 startup
pm2 save
```

## Solución de Problemas

### Errores de Certificado SSL

Si ves `ERR_CERT_AUTHORITY_INVALID`:

1. Asegúrate de que la CA de mkcert esté instalada: `mkcert -install`
2. Reinicia tu navegador
3. Verifica que los certificados existan en las rutas correctas

### Nginx: Conexión Rechazada

1. Verifica que Nginx esté ejecutándose: `nginx -t && nginx`
2. Verifica que `upstream backend` apunte a la dirección correcta
3. Revisa las reglas de firewall para los puertos 80, 443 y 8080

### Conexión a MongoDB Fallida

1. Asegúrate de que MongoDB esté ejecutándose
2. Verifica `DB_CONNECTION_STRING` en `.env`
3. Revisa el acceso de red si usas MongoDB Atlas

### Errores de Token JWT

1. Regenera las claves: `npm run generate-keys`
2. Asegúrate de que el directorio `keys/` tenga los permisos adecuados
3. Verifica que `JWT_ISSUER` y `JWT_AUDIENCE` coincidan entre frontend y backend

## Contribuir

Ver [CONTRIBUTING.md](CONTRIBUTING.md) para guías de desarrollo y estándares de código.

## Recursos Adicionales

- **Documentación de API:** [docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md)
- **Referencia de Permisos:** [docs/PERMISSIONS_REFERENCE.md](docs/PERMISSIONS_REFERENCE.md)
- **English:** [README.md](README.md) - English version of this documentation

## Soporte

Si encuentras problemas:

1. Revisa la sección [Solución de Problemas](#solución-de-problemas)
2. Revisa los logs en el directorio `logs/`
3. Verifica que todas las variables de entorno estén correctamente configuradas
4. Asegúrate de que MongoDB sea accesible
5. Verifica que las claves JWT existan en el directorio `keys/`

## Licencia

ISC

---

**Hecho con ❤️ para la plataforma LendEvent**
