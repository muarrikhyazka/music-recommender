#!/bin/bash

# Debug script to check Docker installation on Ubuntu
echo "🔍 Docker Installation Debug Script"
echo "=================================="

echo
echo "1. Checking if Docker command exists..."
if command -v docker &> /dev/null; then
    echo "✅ docker command found at: $(which docker)"
    docker --version
else
    echo "❌ docker command not found"
fi

echo
echo "2. Checking if Docker service is running..."
if systemctl is-active --quiet docker; then
    echo "✅ Docker service is running"
    systemctl status docker --no-pager -l
else
    echo "❌ Docker service is not running"
    echo "Service status:"
    systemctl status docker --no-pager -l || echo "Docker service not found"
fi

echo
echo "3. Checking Docker Compose..."
if command -v docker-compose &> /dev/null; then
    echo "✅ docker-compose found at: $(which docker-compose)"
    docker-compose --version
else
    echo "⚠️ docker-compose command not found"
fi

if docker compose version &> /dev/null 2>&1; then
    echo "✅ docker compose (v2) is available"
    docker compose version
else
    echo "⚠️ docker compose (v2) not available"
fi

echo
echo "4. Checking user groups..."
echo "Current user: $(whoami)"
echo "User groups: $(groups)"
if groups | grep -q docker; then
    echo "✅ User is in docker group"
else
    echo "❌ User is NOT in docker group"
fi

echo
echo "5. Checking Docker daemon socket..."
if [ -S /var/run/docker.sock ]; then
    echo "✅ Docker socket exists"
    ls -la /var/run/docker.sock
else
    echo "❌ Docker socket not found"
fi

echo
echo "6. Testing Docker access..."
if docker info &> /dev/null; then
    echo "✅ Docker daemon is accessible"
    docker info | head -10
else
    echo "❌ Cannot access Docker daemon"
    echo "Error output:"
    docker info 2>&1 | head -5
fi

echo
echo "7. Checking if snap Docker is installed..."
if command -v snap &> /dev/null; then
    if snap list | grep -q docker; then
        echo "⚠️ Docker is installed via snap:"
        snap list | grep docker
        echo "Note: Snap Docker may have permission issues"
    else
        echo "ℹ️ Docker not installed via snap"
    fi
else
    echo "ℹ️ Snap not available"
fi

echo
echo "8. System information..."
echo "OS: $(cat /etc/os-release | grep PRETTY_NAME | cut -d'=' -f2 | tr -d '\"')"
echo "Kernel: $(uname -r)"
echo "Architecture: $(uname -m)"

echo
echo "=================================="
echo "Debug complete! Please share this output."