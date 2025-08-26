# 🎵 Music Recommender - Deployment Guide

This guide explains how to deploy the Music Recommender system to your Ubuntu mini PC with Cloudflare Tunnel.

## 📋 Prerequisites

### System Requirements
- Ubuntu 20.04+ (or similar Linux distribution)
- 4GB RAM minimum, 8GB recommended
- 20GB free disk space
- Docker and Docker Compose
- Cloudflare account with domain

### Required API Keys
1. **Spotify Developer Account**: https://developer.spotify.com/dashboard
2. **OpenWeatherMap API**: https://openweathermap.org/api
3. **IP Geolocation API** (optional): https://ipgeolocation.io/

## 🚀 Quick Deployment

### 1. Clone Repository
```bash
git clone https://github.com/yourusername/music-recommender.git
cd music-recommender
```

### 2. Run Deployment Script
```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

The script will:
- Check prerequisites
- Create necessary directories
- Set up environment configuration
- Install Cloudflare Tunnel
- Deploy with Docker
- Configure systemd services
- Set up automated backups

### 3. Configure Environment Variables
Edit `/home/$(whoami)/music-recommender/.env`:

```bash
nano /home/$(whoami)/music-recommender/.env
```

**Required configurations:**
```env
# Spotify API
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
SPOTIFY_REDIRECT_URI=https://your-domain.com/auth/callback

# Weather API
WEATHER_API_KEY=your_openweather_key_here

# Domain configuration
FRONTEND_URL=https://your-domain.com
```

### 4. Set Up Cloudflare Tunnel

```bash
# Login to Cloudflare
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create music-recommender

# Update configuration
sudo nano /etc/cloudflared/config.yml
```

Update hostnames in the config file:
```yaml
tunnel: music-recommender
ingress:
  - hostname: your-domain.com
    service: http://localhost:3000
  - hostname: api.your-domain.com  
    service: http://localhost:3001
  - service: http_status:404
```

### 5. Start Services
```bash
# Start application
sudo systemctl start music-recommender

# Start Cloudflare tunnel
sudo systemctl start cloudflared

# Check status
sudo systemctl status music-recommender
sudo systemctl status cloudflared
```

## 🔧 Manual Deployment

### 1. Install Dependencies
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Cloudflared
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
```

### 2. Set Up Application
```bash
# Create application directory
sudo mkdir -p /home/$(whoami)/music-recommender
cd /home/$(whoami)/music-recommender

# Clone repository
git clone https://github.com/yourusername/music-recommender.git .

# Copy environment file
cp .env.production .env
nano .env  # Edit with your configuration
```

### 3. Configure Cloudflare
```bash
# Create tunnel
cloudflared tunnel login
cloudflared tunnel create music-recommender

# Copy configuration
sudo cp cloudflared.yml /etc/cloudflared/config.yml
sudo nano /etc/cloudflared/config.yml  # Update domains

# Install as service
sudo cloudflared service install
```

### 4. Deploy Application
```bash
# Build and start
docker-compose up -d --build

# Check status
docker-compose ps
docker-compose logs -f
```

### 5. Configure Systemd
```bash
# Copy service file
sudo cp deployment/systemd/music-recommender.service /etc/systemd/system/

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable music-recommender
sudo systemctl start music-recommender
```

## 🔍 Monitoring & Maintenance

### Health Checks
```bash
# Application health
curl https://api.your-domain.com/health

# Container status
docker-compose ps

# System services
sudo systemctl status music-recommender
sudo systemctl status cloudflared
```

### Logs
```bash
# Application logs
docker-compose logs -f

# System logs
sudo journalctl -u music-recommender -f
sudo journalctl -u cloudflared -f

# Container logs
docker logs music-recommender-api -f
docker logs music-recommender-web -f
```

### Backups
Automated daily backups are set up by the deployment script:
```bash
# Manual backup
/home/$(whoami)/music-recommender/backup.sh

# View backup log
cat /home/$(whoami)/music-recommender/logs/backup.log

# Restore from backup
# (Instructions in backup directory)
```

### Updates
```bash
# Pull latest changes
cd /home/$(whoami)/music-recommender
git pull origin main

# Rebuild and restart
docker-compose up -d --build

# Restart systemd service
sudo systemctl restart music-recommender
```

## 🔒 Security Considerations

### Firewall Configuration
```bash
# Enable UFW
sudo ufw enable

# Allow SSH
sudo ufw allow ssh

# Cloudflare Tunnel handles HTTPS, no need to open ports 80/443
# Only allow local access to application ports
sudo ufw deny 3000
sudo ufw deny 3001

# Allow Docker communication
sudo ufw allow from 172.16.0.0/12
```

### SSL/TLS
- Cloudflare Tunnel automatically provides SSL/TLS encryption
- No need for manual SSL certificate management
- All traffic is encrypted end-to-end

### Environment Security
```bash
# Secure environment file
chmod 600 /home/$(whoami)/music-recommender/.env
chown $(whoami):$(whoami) /home/$(whoami)/music-recommender/.env
```

## 🐛 Troubleshooting

### Common Issues

1. **Containers won't start**
   ```bash
   docker-compose down
   docker system prune -a
   docker-compose up -d --build
   ```

2. **Database connection issues**
   ```bash
   docker-compose logs mongodb
   docker-compose restart mongodb
   ```

3. **Cloudflare tunnel not connecting**
   ```bash
   sudo systemctl status cloudflared
   sudo journalctl -u cloudflared -f
   cloudflared tunnel info music-recommender
   ```

4. **Permission issues**
   ```bash
   sudo chown -R $(whoami):docker /home/$(whoami)/music-recommender
   sudo chmod +x scripts/*.sh
   ```

### Performance Tuning

1. **MongoDB optimization**
   - Adjust memory settings in docker-compose.yml
   - Monitor database performance with metrics

2. **Redis optimization**
   - Configure memory limits
   - Set appropriate cache policies

3. **Application scaling**
   - Use multiple backend instances
   - Load balance with Nginx

## 📊 Monitoring Dashboard

Access monitoring endpoints:
- Health: `https://api.your-domain.com/health`
- Metrics: `https://api.your-domain.com/api/metrics`
- Database status: Check container logs

## 🆘 Support

If you encounter issues:
1. Check logs first
2. Verify environment configuration
3. Ensure all API keys are valid
4. Check Cloudflare tunnel status
5. Review firewall settings

## 📝 Notes

- The system uses Docker for containerization
- Cloudflare Tunnel provides secure access without exposing ports
- Automatic backups run daily at 2 AM
- Logs are rotated automatically by Docker
- System services restart automatically on failure