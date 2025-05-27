const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8080;

// Audio file URLs
const AUDIO_URLS = {
  '/audio/1': 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  '/audio/2': 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
  '/audio/3': 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
  '/audio/4': 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
  '/audio/hls': 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
};

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url);
  const pathname = parsedUrl.pathname;

  // Proxy audio files
  if (AUDIO_URLS[pathname]) {
    const audioUrl = AUDIO_URLS[pathname];
    const protocol = audioUrl.startsWith('https') ? https : http;
    
    protocol.get(audioUrl, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    }).on('error', (err) => {
      res.writeHead(500);
      res.end('Proxy error: ' + err.message);
    });
    return;
  }

  // Serve static files
  let filePath = '.' + pathname;
  if (filePath === './') {
    filePath = './index.html';
  }

  const extname = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg'
  };

  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File not found');
      } else {
        res.writeHead(500);
        res.end('Server error: ' + error.code);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});