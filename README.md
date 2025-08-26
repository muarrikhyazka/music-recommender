# Munder - Context-Aware Music Recommendation System

A context-aware music recommendation system that creates personalized Spotify playlists based on time, location, weather, and listening history.

## Features

- 🎵 Context-aware recommendations (time, weather, location)
- 🎧 Spotify integration with automatic playlist creation
- 🤖 ML-powered ranking system
- 🌡️ Weather and location-based mood detection
- 📱 Modern React frontend
- 🔐 Secure OAuth authentication
- 📊 Analytics and telemetry

## Tech Stack

### Backend
- Node.js with Express
- TypeScript
- MongoDB with Mongoose
- Redis for caching
- Spotify Web API
- OpenWeatherMap API

### Frontend
- React 18
- TypeScript
- Tailwind CSS
- Axios for API calls

## Getting Started

### Prerequisites
- Node.js 18+
- MongoDB
- Redis
- Spotify Developer Account
- OpenWeatherMap API Key

### Installation

1. Clone the repository
```bash
git clone <repository-url>
cd munder
```

2. Install dependencies
```bash
npm install
cd client && npm install
```

3. Configure environment variables
```bash
cp .env.example .env
# Edit .env with your API keys and configuration
```

4. Start development servers
```bash
npm run dev
```

## API Documentation

### Authentication
- `POST /api/auth/spotify` - Initiate Spotify OAuth
- `GET /api/auth/spotify/callback` - Handle OAuth callback
- `POST /api/auth/refresh` - Refresh access token

### Recommendations
- `POST /api/recommendations/create` - Generate and create playlist
- `GET /api/recommendations/preview` - Preview recommendations

### Context
- `GET /api/context/current` - Get current context data

## Architecture

```
Frontend (React) ──► Backend API ──► Context Services
                         │              │
                         ├──► Rule Engine
                         ├──► ML Ranker
                         └──► Spotify API
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details