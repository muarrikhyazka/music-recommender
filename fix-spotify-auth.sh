#!/bin/bash

# Fix Spotify Authentication - Install Node.js, cookie-parser and restart server
# Run this script on your Ubuntu mini PC server

set -e  # Exit on any error

echo "🔧 Fixing Spotify Authentication..."
echo "=================================="

# Get the script directory (where the music-recommender project should be)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"

echo "📁 Project directory: $PROJECT_DIR"

# Check if we're in the right directory
if [ ! -f "$PROJECT_DIR/package.json" ]; then
    echo "❌ Error: package.json not found in $PROJECT_DIR"
    echo "Make sure this script is in your music-recommender root directory"
    exit 1
fi

# Check if Node.js and npm are installed
if ! command -v node > /dev/null 2>&1 || ! command -v npm > /dev/null 2>&1; then
    echo "📥 Node.js and npm not found. Installing..."
    
    # Update package list
    sudo apt update
    
    # Install Node.js and npm using NodeSource repository (LTS version)
    echo "🌐 Adding NodeSource repository..."
    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
    
    echo "📦 Installing Node.js and npm..."
    sudo apt-get install -y nodejs
    
    # Verify installation
    echo "✅ Node.js version: $(node --version)"
    echo "✅ npm version: $(npm --version)"
else
    echo "✅ Node.js version: $(node --version)"
    echo "✅ npm version: $(npm --version)"
fi

# Install cookie-parser
echo "📦 Installing cookie-parser..."
npm install cookie-parser

# Check if PM2 is being used
if command -v pm2 > /dev/null 2>&1; then
    echo "🔄 Restarting server with PM2..."
    pm2 restart all || pm2 start server/index.js --name "music-recommender"
elif pgrep -f "node.*server/index.js" > /dev/null; then
    echo "🔄 Stopping existing Node.js server..."
    
    # Try regular kill first, then sudo if needed
    if ! pkill -f "node.*server/index.js" 2>/dev/null; then
        echo "⚠️  Regular kill failed, trying with sudo..."
        if ! sudo pkill -f "node.*server/index.js" 2>/dev/null; then
            echo "❌ Could not stop existing process. Please manually stop it:"
            echo "   ps aux | grep 'node.*server/index.js'"
            echo "   sudo kill <PID>"
            echo ""
            echo "💡 Consider using PM2 for better process management:"
            echo "   sudo npm install -g pm2"
            echo "   pm2 start server/index.js --name 'music-recommender'"
            echo ""
            read -p "Press Enter after stopping the process manually, or Ctrl+C to exit..."
        fi
    fi
    
    sleep 2
    echo "🚀 Starting server..."
    cd "$PROJECT_DIR" && nohup node server/index.js > server.log 2>&1 &
    echo "Server started in background. Check server.log for output."
else
    echo "🚀 Starting server..."
    cd "$PROJECT_DIR" && nohup node server/index.js > server.log 2>&1 &
    echo "Server started in background. Check server.log for output."
fi

echo ""
echo "✅ Spotify authentication fix applied successfully!"
echo "📝 Changes made:"
echo "   • Installed cookie-parser package"
echo "   • Updated server/index.js to include cookie-parser middleware"
echo "   • Fixed cookie access in server/routes/auth.js"
echo "   • Updated client/src/pages/AuthCallbackPage.tsx to handle callbacks"
echo ""
echo "🌐 Your server should now be running. Test the Spotify authentication!"
echo "   If using PM2: pm2 logs"
echo "   If using regular node: tail -f server.log"