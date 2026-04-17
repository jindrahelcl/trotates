# Map Rotator

A browser puzzle game using real map tiles from [mapy.com](https://mapy.com). A grid of tiles from a random location in Czechia is scrambled by rotating each tile. Click (or tap) to rotate tiles back into the correct orientation.

## Features

- Real map tiles from mapy.com (outdoor layer)
- Random locations sampled within Czechia
- Configurable grid size (up to 20×20) and zoom level
- Multi-touch support — rotate multiple tiles simultaneously
- Leaderboard with nicknames, stored server-side
- Mobile-responsive layout
- Win animation and "Admire" mode to view the solved map

## Requirements

- Node.js (v14+ recommended; works on v12+ including Raspberry Pi OS defaults)
- A free mapy.com API key from [developer.mapy.com](https://developer.mapy.com)

## Quick start

```bash
git clone git@github.com:jindrahelcl/trotates.git
cd trotates
cp .env.example .env   # then edit and add your API key
node server.js
# open http://localhost:3000
```

## Configuration

Copy `.env.example` to `.env` and fill in your key:

```
MAPY_API_KEY=your_key_here
PORT=3000
```

The API key is never exposed to the browser — all tile requests are proxied through the server.

## Deployment (Raspberry Pi / Linux)

Run the interactive setup script after cloning:

```bash
./setup.sh
```

It will ask for your API key, domain name, and whether to set up SSL, then configure Node.js, PM2, nginx, and Let's Encrypt automatically.

## License

MIT
