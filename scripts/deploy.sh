#!/bin/bash

# Music Recommender Deployment Script for Ubuntu Server
# This script sets up the application with Docker and Cloudflare Tunnel

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🎵 Munder Deployment Script${NC}"
echo "========================================"

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo -e "${RED}❌ Please run this script as a non-root user with sudo privileges${NC}"
    exit 1
fi

# Configuration
APP_NAME="munder"
APP_DIR="/home/$(whoami)/${APP_NAME}"
SYSTEMD_DIR="/etc/systemd/system"
CLOUDFLARED_DIR="/etc/cloudflared"

# Functions
log_info() {
    echo -e "${GREEN}ℹ️  $1${NC}"
}

log_warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    # Check if Docker Compose is installed (check both old and new format)
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    # Set Docker Compose command based on what's available
    if command -v docker-compose &> /dev/null; then
        DOCKER_COMPOSE_CMD="docker-compose"
    else
        DOCKER_COMPOSE_CMD="docker compose"
    fi
    
    # Check if user is in docker group
    if ! groups | grep -q docker; then
        log_warn "User is not in docker group. Adding user to docker group..."
        sudo usermod -aG docker $(whoami)
        log_warn "Please log out and log back in for group changes to take effect, then run this script again."
        exit 1
    fi
    
    log_info "Prerequisites check passed ✅"
}

# Create directories
create_directories() {
    log_info "Creating application directories..."
    
    sudo mkdir -p "${APP_DIR}"
    sudo mkdir -p "${APP_DIR}/logs"
    sudo mkdir -p "${APP_DIR}/data/mongodb"
    sudo mkdir -p "${APP_DIR}/data/redis"
    sudo mkdir -p "${CLOUDFLARED_DIR}"
    
    # Set proper permissions
    sudo chown -R $(whoami):$(whoami) "${APP_DIR}"
    
    log_info "Directories created ✅"
}

# Setup environment file
setup_environment() {
    log_info "Setting up environment configuration..."
    
    if [ ! -f "${APP_DIR}/.env" ]; then
        log_warn "Environment file not found. Creating template..."
        
        cat > "${APP_DIR}/.env" << EOF
# Production Environment Configuration
NODE_ENV=production

# Database
MONGO_ROOT_USERNAME=munder
MONGO_ROOT_PASSWORD=$(openssl rand -base64 32)
MONGO_DATABASE=munder

# Redis
REDIS_PASSWORD=$(openssl rand -base64 32)

# JWT Secret
JWT_SECRET=$(openssl rand -base64 64)

# Spotify API (REQUIRED - Get from https://developer.spotify.com)
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=https://munder.myghty.cloud/auth/callback

# Weather API (Get from https://openweathermap.org/api)
WEATHER_API_KEY=your_openweather_api_key

# GeoIP API (Optional - Get from https://ipgeolocation.io)
GEOIP_API_KEY=your_geoip_api_key

# Frontend URL
FRONTEND_URL=https://munder.myghty.cloud
REACT_APP_API_URL=/api

# Logging
LOG_LEVEL=info

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
EOF
        
        log_warn "Please edit ${APP_DIR}/.env with your API keys and domain configuration"
        log_warn "Required: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, WEATHER_API_KEY"
        read -p "Press Enter after updating the .env file..."
    else
        log_info "Environment file already exists ✅"
    fi
}

# Setup Cloudflare Tunnel
setup_cloudflare_tunnel() {
    log_info "Setting up Cloudflare Tunnel..."
    
    # Check if cloudflared is installed
    if ! command -v cloudflared &> /dev/null; then
        log_info "Installing cloudflared..."
        
        # Download and install cloudflared
        wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
        sudo dpkg -i cloudflared-linux-amd64.deb
        rm cloudflared-linux-amd64.deb
        
        log_info "cloudflared installed ✅"
    fi
    
    # Copy tunnel configuration
    if [ -f "./cloudflared.yml" ]; then
        sudo cp "./cloudflared.yml" "${CLOUDFLARED_DIR}/config.yml"
        log_info "Cloudflare tunnel configuration copied ✅"
        
        log_warn "Please update the domain names in ${CLOUDFLARED_DIR}/config.yml"
        log_warn "You also need to create a tunnel and add the credentials file"
        log_warn "Run: cloudflared tunnel login"
        log_warn "Then: cloudflared tunnel create ${APP_NAME}"
        log_warn "And place the credentials file in ${CLOUDFLARED_DIR}/credentials.json"
    else
        log_error "cloudflared.yml not found in current directory"
        exit 1
    fi
}

# Deploy application
deploy_application() {
    log_info "Deploying application..."
    
    # Copy application files
    cp -r ./* "${APP_DIR}/"
    
    # Build and start containers
    cd "${APP_DIR}"
    
    log_info "Building Docker images..."
    ${DOCKER_COMPOSE_CMD} build --no-cache
    
    log_info "Starting services..."
    ${DOCKER_COMPOSE_CMD} up -d
    
    # Wait for services to be healthy
    log_info "Waiting for services to be ready..."
    sleep 30
    
    # Check service health
    if ${DOCKER_COMPOSE_CMD} ps | grep -q "Up (healthy)"; then
        log_info "Services started successfully ✅"
    else
        log_error "Some services failed to start properly"
        ${DOCKER_COMPOSE_CMD} ps
        ${DOCKER_COMPOSE_CMD} logs
        exit 1
    fi
}

# Setup systemd services
setup_systemd_services() {
    log_info "Setting up systemd services..."
    
    # Docker compose service
    cat > /tmp/${APP_NAME}.service << EOF
[Unit]
Description=Munder Application
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${APP_DIR}
ExecStart=${DOCKER_COMPOSE_CMD} up -d
ExecStop=${DOCKER_COMPOSE_CMD} down
TimeoutStartSec=0
User=$(whoami)
Group=docker

[Install]
WantedBy=multi-user.target
EOF

    sudo mv /tmp/${APP_NAME}.service "${SYSTEMD_DIR}/"
    
    # Cloudflare tunnel service
    if [ -f "${CLOUDFLARED_DIR}/config.yml" ]; then
        sudo cloudflared service install
        sudo systemctl enable cloudflared
        log_info "Cloudflare tunnel service installed ✅"
    fi
    
    # Enable and start music recommender service
    sudo systemctl daemon-reload
    sudo systemctl enable ${APP_NAME}
    sudo systemctl start ${APP_NAME}
    
    log_info "Systemd services configured ✅"
}

# Setup monitoring and maintenance
setup_maintenance() {
    log_info "Setting up maintenance tasks..."
    
    # Create backup script
    cat > "${APP_DIR}/backup.sh" << EOF
#!/bin/bash
# Backup script for Munder
BACKUP_DIR="/home/$(whoami)/backups/${APP_NAME}"
DATE=\$(date +%Y%m%d_%H%M%S)

mkdir -p "\${BACKUP_DIR}"

# Backup database
docker exec munder-db mongodump --out /tmp/backup_\${DATE}
docker cp munder-db:/tmp/backup_\${DATE} "\${BACKUP_DIR}/mongodb_\${DATE}"

# Backup environment and configs
cp "${APP_DIR}/.env" "\${BACKUP_DIR}/env_\${DATE}"
cp -r "${CLOUDFLARED_DIR}" "\${BACKUP_DIR}/cloudflared_\${DATE}"

# Cleanup old backups (keep last 7 days)
find "\${BACKUP_DIR}" -name "mongodb_*" -mtime +7 -delete
find "\${BACKUP_DIR}" -name "env_*" -mtime +7 -delete
find "\${BACKUP_DIR}" -name "cloudflared_*" -mtime +7 -delete

echo "Backup completed: \${DATE}"
EOF
    
    chmod +x "${APP_DIR}/backup.sh"
    
    # Add to crontab (daily backup at 2 AM)
    (crontab -l 2>/dev/null; echo "0 2 * * * ${APP_DIR}/backup.sh >> ${APP_DIR}/logs/backup.log 2>&1") | crontab -
    
    log_info "Backup script and cron job created ✅"
}

# Print final instructions
print_final_instructions() {
    log_info "🎉 Deployment completed successfully!"
    echo
    echo "Next steps:"
    echo "1. Configure your Cloudflare tunnel:"
    echo "   - Run: cloudflared tunnel login"
    echo "   - Run: cloudflared tunnel create ${APP_NAME}"
    echo "   - Update ${CLOUDFLARED_DIR}/config.yml with your domains"
    echo "   - Start tunnel: sudo systemctl start cloudflared"
    echo
    echo "2. Update your environment variables in ${APP_DIR}/.env"
    echo "   - Add your Spotify API credentials"
    echo "   - Add your Weather API key"
    echo "   - Update domain names"
    echo
    echo "3. Check service status:"
    echo "   - ${DOCKER_COMPOSE_CMD} ps"
    echo "   - sudo systemctl status ${APP_NAME}"
    echo "   - sudo systemctl status cloudflared"
    echo
    echo "4. View logs:"
    echo "   - Application: ${DOCKER_COMPOSE_CMD} logs -f"
    echo "   - System: sudo journalctl -u ${APP_NAME} -f"
    echo
    echo "5. Access your application:"
    echo "   - Frontend: https://your-domain.com"
    echo "   - API: https://api.your-domain.com"
    echo "   - Health: https://api.your-domain.com/health"
    echo
    log_info "Happy music recommending! 🎵"
}

# Main execution
main() {
    check_prerequisites
    create_directories
    setup_environment
    setup_cloudflare_tunnel
    deploy_application
    setup_systemd_services
    setup_maintenance
    print_final_instructions
}

# Check if script is being run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi