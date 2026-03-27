# LendEvent API

API Backend para la plataforma de gestión de alquileres de eventos LendEvent.

## Stack Tecnológico

- **Runtime:** Node.js 22+
- **Lenguaje:** TypeScript 5.9
- **Framework:** Express 5
- **Base de Datos:** MongoDB (Mongoose 9)
- **Autenticación:** JWT con cookies HttpOnly
- **Pagos:** Stripe
- **Pruebas:** Playwright

## Requisitos Previos

- [Node.js 22+](https://nodejs.org/)
- [MongoDB](https://www.mongodb.com/) (local o Atlas)
- [Nginx](https://nginx.org/) para proxy HTTPS local
- [mkcert](https://github.com/FiloSottile/mkcert) para generar certificados SSL

## Comenzando

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

Copie el archivo de ejemplo de entorno y configúrelo:

```bash
cp .env.example .env
```

Edite `.env` con sus valores (asegúrese de configurar `DB_CONNECTION_STRING`).

### 4. Proporcionar llaves JWT

El backend utiliza llaves asimétricas RS256 para la firma de JWT. Estas llaves deben colocarse en el directorio `keys/`:

```bash
mkdir -p keys
# Coloque private.pem y public.pem en keys/
```

### 5. Iniciar la API

```bash
# Modo desarrollo con recarga en caliente
npm run dev

# Construir para producción
npm run build
npm start
```

## Ejecución con Docker (Recomendado)

Consulte el archivo raíz [SETUP.es.md](../SETUP.es.md) para la orquestación completa del stack usando Docker Compose y Nginx.

## Estructura del Proyecto

- `src/modules/`: Lógica de negocio organizada por dominio (auth, material, loan, etc.).
- `src/middleware/`: Middlewares globales (autenticación, validación, manejo de errores).
- `tests/api/`: Pruebas de integración de la API usando Playwright.
- `scripts/`: Scripts de utilidad y migraciones.
