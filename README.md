# Audio Stream Compare

Audio streaming comparison app with Cloudflare Workers backend and Pages frontend.

## Setup

1. Deploy the Worker:
   ```bash
   npx wrangler deploy
   ```

2. Update `WORKER_URL` in `app.js` with your deployed Worker URL

3. Deploy to Cloudflare Pages:
   - Upload `index.html`, `app.js`, and `style.css`
   - No build command needed (static files)

## Architecture

- **Frontend**: Static files hosted on Cloudflare Pages
- **Backend**: Cloudflare Workers for audio proxy to avoid CORS issues
- **Audio Sources**: External MP3 and HLS streams proxied through Workers