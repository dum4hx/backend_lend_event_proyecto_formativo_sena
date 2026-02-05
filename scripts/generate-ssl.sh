#!/bin/bash
# ============================================
# SSL Certificate Generation Script
# Uses mkcert for local development certificates
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSL_DIR="$SCRIPT_DIR/../docker/nginx/ssl"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Check if mkcert is installed
if ! command -v mkcert &> /dev/null; then
    echo -e "${YELLOW}mkcert is not installed. Installing...${NC}"
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        brew install mkcert
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        if command -v apt &> /dev/null; then
            sudo apt update && sudo apt install -y mkcert
        elif command -v dnf &> /dev/null; then
            sudo dnf install -y mkcert
        else
            echo -e "${RED}Please install mkcert manually: https://github.com/FiloSottile/mkcert${NC}"
            exit 1
        fi
    else
        echo -e "${RED}Unsupported OS. Please install mkcert manually.${NC}"
        exit 1
    fi
fi

# Create SSL directory
mkdir -p "$SSL_DIR"

# Install local CA
echo -e "${CYAN}Installing local CA (may require sudo)...${NC}"
mkcert -install

# Generate certificates
echo -e "${CYAN}Generating SSL certificate for api.test.local...${NC}"
cd "$SSL_DIR"
mkcert api.test.local localhost 127.0.0.1 ::1

# Rename to match nginx.conf
mv "api.test.local+3.pem" "api.test.local.pem" 2>/dev/null || true
mv "api.test.local+3-key.pem" "api.test.local-key.pem" 2>/dev/null || true

echo ""
echo -e "${GREEN}SSL certificates generated successfully!${NC}"
echo -e "  Certificate: $SSL_DIR/api.test.local.pem"
echo -e "  Key: $SSL_DIR/api.test.local-key.pem"
echo ""
echo -e "${YELLOW}Add to /etc/hosts:${NC}"
echo -e "${CYAN}  127.0.0.1 api.test.local${NC}"
echo ""
echo -e "${GREEN}Then run: docker-compose up --build${NC}"
