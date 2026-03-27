# LendEvent API

Backend API for the LendEvent event rental management platform. A complete multi-tenant system for managing equipment rental operations, including inventory management, loan requests, approvals, invoicing, and payment processing with Stripe integration.

## Features

- 🔐 **Secure Authentication** - JWT with HttpOnly cookies and RSA signing
- 🏢 **Multi-Tenant Architecture** - Complete data isolation per organization
- 👥 **Role-Based Access Control** - 55+ granular permissions
- 📦 **Inventory Management** - Categories, types, and individual material instances
- 📝 **Loan Request Workflow** - Request → Approval → Assignment → Checkout → Return
- 💰 **Billing & Invoicing** - Automated invoicing with Stripe integration
- 🔍 **Inspections** - Checkout and return inspections with damage tracking
- 📊 **Subscription Management** - Multiple plans with configurable limits
- 🧪 **Comprehensive Testing** - E2E API tests with Playwright

## Tech Stack

- **Runtime:** Node.js 22+
- **Language:** TypeScript 5.9
- **Framework:** Express 5
- **Database:** MongoDB (Mongoose 9)
- **Authentication:** JWT with HttpOnly cookies
- **Payments:** Stripe
- **Testing:** Playwright

## Prerequisites

Before you begin, ensure you have the following installed:

- **[Node.js 22+](https://nodejs.org/)** - JavaScript runtime (includes npm)
- **[MongoDB](https://www.mongodb.com/)** - NoSQL database (local installation or Atlas cloud)
- **[Nginx](https://nginx.org/)** - Web server for local HTTPS proxy (optional, for testing with HTTPS)
- **[mkcert](https://github.com/FiloSottile/mkcert)** - Tool for generating local SSL certificates (optional, for HTTPS)

> **Note:** Nginx and mkcert are optional for basic development. You can run the API directly on `http://localhost:8080` without them.

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/dum4hx/backend_lend_event_proyecto_formativo_sena.git backend_repository
cd backend_repository
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit `.env` with your values (ensure `DB_CONNECTION_STRING` is set).

### 4. Provide JWT keys

The backend uses asymmetric RS256 keys for JWT signing. These keys must be placed in the `keys/` directory:

```bash
mkdir -p keys
# Place private.pem and public.pem in keys/
```

### 5. Start the API

```bash
# Development mode with hot-reload
npm run dev

# Build for production
npm run build
npm start
```

## Running with Docker (Recommended)

Refer to the root [SETUP.md](../SETUP.md) for full stack orchestration using Docker Compose and Nginx.

## Project Structure

DB_CONNECTION_STRING=mongodb://localhost:27017/lendevent

# For MongoDB Atlas (cloud):

# DB_CONNECTION_STRING=mongodb+srv://username:password@cluster.mongodb.net/lendevent

# JWT Configuration

JWT_ASYMMETRIC_KEY_ALG='RS256'
JWT_ENC='A256GCM'
JWT_ISSUER='https://api.test.local/'
JWT_AUDIENCE='https://app.test.local/'

# Cookie domain (must match your local domain)

COOKIE_DOMAIN=test.local

# Stripe (get keys from https://dashboard.stripe.com/apikeys)

STRIPE*SECRET_KEY=sk_test*...
STRIPE*WEBHOOK_SECRET=whsec*...

# Environment

NODE_ENV=development

````

### 4. Generate JWT Keys

Generate RSA key pairs for JWT signing:

```bash
npm run generate-keys
````

This creates key files in the `keys/` directory.

### 5. Create Initial Super Admin User (Optional)

Create the platform super administrator account:

1. Set the admin credentials in your `.env` file:

```dotenv
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=YourSecurePassword123!
```

2. Run the seeder:

```bash
npm run seed:admin
```

This creates:

- A special "Platform Administration" organization
- A super admin user with full platform access

**Note:** This is a one-time operation. The seeder will skip if a super admin already exists with the specified email.

### 6. Set Up Local Domains with Nginx

The project uses custom local domains for development:

| Domain           | Purpose                    |
| ---------------- | -------------------------- |
| `app.test.local` | Frontend web application   |
| `api.test.local` | Backend API (this project) |

#### 6.1 Add Hosts Entries

Add the following to your hosts file:

**Windows:** `C:\Windows\System32\drivers\etc\hosts`  
**macOS/Linux:** `/etc/hosts`

```
127.0.0.1 app.test.local
127.0.0.1 api.test.local
```

#### 6.2 Generate SSL Certificates

Install mkcert and generate certificates:

```bash
# Install mkcert (Windows with Chocolatey)
choco install mkcert

# Or on macOS with Homebrew
brew install mkcert

# Install the local CA
mkcert -install

# Generate certificates for both domains
mkcert -cert-file api.test.local.pem -key-file api.test.local-key.pem api.test.local
mkcert -cert-file app.test.local.pem -key-file app.test.local-key.pem app.test.local
```

Or use the provided script:

```bash
# PowerShell (Windows)
./scripts/generate-ssl.ps1

# Bash (macOS/Linux)
./scripts/generate-ssl.sh
```

#### 6.3 Configure Nginx

Copy the certificates to your Nginx SSL directory and use the provided configuration:

**Option A: Docker (Recommended)**

```bash
docker-compose up -d
```

This starts Nginx with the configuration in `docker/nginx/nginx.conf`.

**Option B: Local Nginx Installation**

1. Copy `docker/nginx/nginx.conf` to your Nginx config directory
2. Copy SSL certificates to the paths specified in the config
3. Update the `upstream backend` block to point to `localhost:8080`
4. Reload Nginx:

```bash
# Windows
nginx -s reload

# macOS/Linux
sudo nginx -s reload
```

### 7. Start the Development Server

```bash
npm run dev
```

The API will be available at:

- **Direct:** `http://localhost:8080`
- **Via Nginx:** `https://api.test.local`

### 8. Verify Setup

Test the health endpoint:

```bash
curl https://api.test.local/health
```

Expected response:

```json
{
  "status": "success",
  "message": "Server running properly",
  "timestamp": "2026-02-09T...",
  "environment": "development"
}
```

## Available Scripts

| Command                 | Description                              |
| ----------------------- | ---------------------------------------- |
| `npm run dev`           | Start development server with hot reload |
| `npm run build`         | Compile TypeScript to JavaScript         |
| `npm start`             | Run compiled production build            |
| `npm run generate-keys` | Generate JWT RSA key pairs               |
| `npm run seed:admin`    | Create initial super admin user          |
| `npm test`              | Run all Playwright tests                 |
| `npm run test:auth`     | Run authentication tests                 |
| `npm run test:users`    | Run user management tests                |
| `npm run test:ui`       | Open Playwright UI mode                  |

## Project Structure

The project follows a modular architecture with clear separation of concerns:

```
src/
├── server.ts              # Application entry point - Express setup & middleware configuration
├── errors/                # Custom error classes
│   └── AppError.ts        # Operational error class with factory methods
├── middleware/            # Express middleware
│   ├── auth.ts            # JWT authentication & RBAC authorization
│   ├── rate_limiter.ts    # Request rate limiting (per IP/user)
│   ├── validation.ts      # Zod schema validation
│   ├── error_logger.ts    # Winston error logging
│   └── error_responder.ts # Standardized error responses
├── modules/               # Feature modules (Router → Service → Model pattern)
│   ├── auth/              # Authentication (register, login, logout, refresh)
│   ├── billing/           # Stripe billing & webhooks
│   ├── customer/          # Customer management
│   ├── inspection/        # Material inspections (checkout/return)
│   ├── invoice/           # Invoicing system
│   ├── loan/              # Active rental loans
│   ├── location/          # Physical locations/warehouses
│   ├── material/          # Catalog & inventory (categories, types, instances)
│   ├── organization/      # Multi-tenant organizations
│   ├── package/           # Material packages (bundles)
│   ├── request/           # Loan requests (request → approval → loan)
│   ├── roles/             # RBAC roles & permissions
│   ├── subscription_type/ # Subscription plans configuration
│   ├── super_admin/       # Platform-wide admin analytics
│   ├── transfer/          # Inter-location material transfers
│   └── user/              # User management
├── routers/               # Express route aggregation
│   └── index.ts           # Central router export
├── scripts/               # Utility scripts
│   ├── generate_keys.ts   # Generate RSA key pairs for JWT
│   └── export_permissions_doc.ts # Generate permissions documentation
└── utils/                 # Shared utilities
    ├── auth/              # JWT signing & verification helpers
    ├── db/                # MongoDB connection
    │   └── connectDB.ts
    ├── logger.ts          # Winston logger configuration
    └── email.ts           # Nodemailer email service
```

### Module Pattern

Each module follows a consistent pattern:

- `*.router.ts` - HTTP routes, authentication, permission checks, validation
- `*.service.ts` - Business logic, database queries, data transformations
- `models/` - Mongoose schemas and Zod validation schemas

**Example flow:** Request → Router (validate) → Service (business logic) → Model (database) → Response

## API Documentation

See [docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md) for complete API reference with all endpoints, request/response examples, and error codes.

## Security

### Authentication

- **JWT with RSA (RS256)** - Asymmetric signing with public/private key pairs
- **JWE (A256GCM)** - Encrypted JWT tokens for sensitive data
- **HttpOnly Cookies** - Prevents XSS attacks (tokens not accessible via JavaScript)
- **Access Token** - 15-minute expiration
- **Refresh Token** - 7-day expiration (restricted to `/auth` endpoints only)

### Authorization (RBAC)

- **55+ Granular Permissions** - Format: `resource:action` (e.g., `materials:read`, `users:delete`)
- **Custom Roles per Organization** - Each organization can define its own roles
- **Permission Inheritance** - System roles (Owner, Admin) with predefined permissions
- **Request-Level Checks** - Every protected endpoint validates user permissions

### Additional Security Measures

- **Argon2 Password Hashing** - More secure than bcrypt
- **Helmet** - Sets secure HTTP headers (CSP, HSTS, X-Frame-Options, etc.)
- **CORS** - Strict origin validation with credentials support
- **Rate Limiting** - Prevents brute-force attacks (configurable per endpoint)
- **Input Validation** - Zod schema validation for all requests
- **MongoDB Injection Prevention** - Mongoose query sanitization
- **Multi-Tenant Isolation** - All queries scoped by `organizationId`

## Testing

### Prerequisites for Testing

1. Ensure the API server is running
2. Configure `playwright.config.ts` with your base URL

### Run Tests

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:auth
npm run test:users

# Interactive UI mode
npm run test:ui
```

### Super Admin Tests

Super admin tests require a pre-seeded super_admin account. Configure via environment:

```bash
SUPER_ADMIN_EMAIL=superadmin@test.local
SUPER_ADMIN_PASSWORD=SuperAdmin123!
```

## Docker Deployment

### Development with Docker Compose

```bash
# Start all services (API + Nginx)
docker-compose up -d

# View logs
docker-compose logs -f api

# Stop services
docker-compose down
```

### Production Build

```bash
# Build the Docker image
docker build -t lendevent-api .

# Run the container
docker run -p 8080:8080 --env-file .env lendevent-api
```

**Docker Image Features:**

- Multi-stage build (smaller image size)
- Non-root user for security
- Health check endpoint
- Optimized layer caching

## Production Deployment

### Environment Configuration

1. **Use Environment Variables** - Never use `.env` files in production. Use your hosting provider's environment variable management.

2. **Required Variables for Production:**

   ```bash
   NODE_ENV=production
   DB_CONNECTION_STRING=<mongodb-atlas-uri>
   JWT_ISSUER=https://api.yourdomain.com/
   JWT_AUDIENCE=https://app.yourdomain.com/
   COOKIE_DOMAIN=yourdomain.com
   CORS_ORIGIN=https://app.yourdomain.com
   STRIPE_SECRET_KEY=<live-key>
   STRIPE_WEBHOOK_SECRET=<live-webhook-secret>
   ```

3. **Security Checklist:**
   - ✅ Use HTTPS (cookies with `secure` flag)
   - ✅ Configure MongoDB Atlas IP whitelist
   - ✅ Rotate JWT keys regularly
   - ✅ Enable rate limiting
   - ✅ Set up monitoring and alerts
   - ✅ Configure CORS for specific domains only
   - ✅ Use strong passwords for all accounts
   - ✅ Enable MongoDB authentication
   - ✅ Set up automated backups

### Recommended Hosting Options

- **API Hosting:** Heroku, Railway, Render, DigitalOcean App Platform, AWS ECS
- **Database:** MongoDB Atlas (managed, automatic backups, scaling)
- **Monitoring:** New Relic, Datadog, or built-in Winston logs

### Process Management

For production without Docker, use a process manager:

```bash
# Install PM2
npm install -g pm2

# Start the API
pm2 start dist/server.js --name lendevent-api

# View logs
pm2 logs lendevent-api

# Monitor
pm2 monit

# Auto-restart on reboot
pm2 startup
pm2 save
```

## Troubleshooting

### SSL Certificate Errors

If you see `ERR_CERT_AUTHORITY_INVALID`:

1. Ensure mkcert CA is installed: `mkcert -install`
2. Restart your browser
3. Verify certificates exist in the correct paths

### Nginx Connection Refused

1. Check Nginx is running: `nginx -t && nginx`
2. Verify the `upstream backend` points to the correct address
3. Check firewall rules for ports 80, 443, and 8080

### MongoDB Connection Failed

1. Ensure MongoDB is running
2. Verify `DB_CONNECTION_STRING` in `.env`
3. Check network access if using MongoDB Atlas

### JWT Token Errors

1. Regenerate keys: `npm run generate-keys`
2. Ensure `keys/` directory has proper permissions
3. Verify `JWT_ISSUER` and `JWT_AUDIENCE` match between frontend and backend

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines and coding standards.

## Additional Resources

- **API Documentation:** [docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md)
- **Permissions Reference:** [docs/PERMISSIONS_REFERENCE.md](docs/PERMISSIONS_REFERENCE.md)
- **Español:** [README_SPANISH.md](README_SPANISH.md) - Versión en español de esta documentación

## Support

If you encounter issues:

1. Check the [Troubleshooting](#troubleshooting) section
2. Review logs in the `logs/` directory
3. Verify all environment variables are correctly set
4. Ensure MongoDB is accessible
5. Check that JWT keys exist in `keys/` directory

## License

ISC

---

**Made with ❤️ for the LendEvent platform**
