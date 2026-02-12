# LendEvent API

Backend API for the LendEvent event rental management platform.

## Tech Stack

- **Runtime:** Node.js 22+
- **Language:** TypeScript 5.9
- **Framework:** Express 5
- **Database:** MongoDB (Mongoose 9)
- **Authentication:** JWT with HttpOnly cookies
- **Payments:** Stripe
- **Testing:** Playwright

## Prerequisites

- [Node.js 22+](https://nodejs.org/)
- [MongoDB](https://www.mongodb.com/) (local or Atlas)
- [Nginx](https://nginx.org/) for local HTTPS proxy
- [mkcert](https://github.com/FiloSottile/mkcert) for generating SSL certificates

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

Edit `.env` with your values:

```dotenv
PORT=8080

# Database
DB_CONNECTION_STRING=mongodb://localhost:27017/lendevent

# JWT Configuration
JWT_ASYMMETRIC_KEY_ALG='RS256'
JWT_ENC='A256GCM'
JWT_ISSUER='https://api.test.local/'
JWT_AUDIENCE='https://app.test.local/'

# Cookie domain (must match your local domain)
COOKIE_DOMAIN=test.local

# Stripe (get keys from https://dashboard.stripe.com/apikeys)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Environment
NODE_ENV=development
```

### 4. Generate JWT Keys

Generate RSA key pairs for JWT signing:

```bash
npm run generate-keys
```

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

```
src/
├── server.ts              # Application entry point
├── errors/                # Custom error classes
├── middleware/            # Express middleware
│   ├── auth.ts            # JWT authentication
│   ├── rate_limiter.ts    # Rate limiting
│   └── validation.ts      # Request validation
├── modules/               # Feature modules
│   ├── auth/              # Authentication
│   ├── billing/           # Stripe billing
│   ├── customer/          # Customer management
│   ├── inspection/        # Return inspections
│   ├── invoice/           # Invoicing
│   ├── loan/              # Rental loans
│   ├── material/          # Catalog & inventory
│   ├── organization/      # Multi-tenancy
│   ├── package/           # Material packages
│   ├── request/           # Loan requests
│   ├── subscription_type/ # Subscription plans
│   ├── super_admin/       # Admin analytics
│   └── user/              # User management
├── routers/               # Express routers
└── utils/                 # Utilities
    ├── auth/              # JWT helpers
    ├── db/                # Database connection
    └── logger.ts          # Winston logger
```

## API Documentation

See [docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md) for complete API reference.

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

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

ISC
