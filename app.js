// Web Audio API Streaming Implementation
class WebAudioStreamer {
    constructor() {
        this.audioContext = null;
        this.source = null;
        this.isPlaying = false;
    }

    async start() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const response = await fetch('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3');
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            this.source = this.audioContext.createBufferSource();
            this.source.buffer = audioBuffer;
            this.source.connect(this.audioContext.destination);
            this.source.start();
            this.isPlaying = true;
            
            this.source.onended = () => {
                this.isPlaying = false;
                updateStatus('webAudio', '再生完了', '');
                toggleButtons('webAudio', false);
            };
            
            updateStatus('webAudio', '再生中', 'playing');
        } catch (error) {
            updateStatus('webAudio', 'エラー: ' + error.message, 'error');
            toggleButtons('webAudio', false);
        }
    }

    stop() {
        if (this.source && this.isPlaying) {
            this.source.stop();
            this.isPlaying = false;
        }
        if (this.audioContext) {
            this.audioContext.close();
        }
        updateStatus('webAudio', '停止', '');
    }
}

// HLS Implementation
class HLSStreamer {
    constructor() {
        this.hls = null;
        this.audio = document.getElementById('hlsAudio');
    }

    start() {
        if (Hls.isSupported()) {
            this.hls = new Hls();
            // Using a public HLS stream for demo
            this.hls.loadSource('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8');
            this.hls.attachMedia(this.audio);
            
            this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
                this.audio.play();
                updateStatus('hls', '再生中', 'playing');
            });
            
            this.hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    updateStatus('hls', 'エラー: ' + data.type, 'error');
                    toggleButtons('hls', false);
                }
            });
        } else if (this.audio.canPlayType('application/vnd.apple.mpegurl')) {
            // For Safari native HLS support
            this.audio.src = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
            this.audio.play();
            updateStatus('hls', '再生中 (Native)', 'playing');
        } else {
            updateStatus('hls', 'HLSはサポートされていません', 'error');
            toggleButtons('hls', false);
        }
    }

    stop() {
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }
        this.audio.pause();
        this.audio.src = '';
        updateStatus('hls', '停止', '');
    }
}

// Media Source Extensions Implementation
class MSEStreamer {
    constructor() {
        this.mediaSource = null;
        this.sourceBuffer = null;
        this.audio = document.getElementById('mseAudio');
        this.queue = [];
        this.isAppending = false;
    }

    async start() {
        try {
            this.mediaSource = new MediaSource();
            this.audio.src = URL.createObjectURL(this.mediaSource);
            
            this.mediaSource.addEventListener('sourceopen', async () => {
                this.sourceBuffer = this.mediaSource.addSourceBuffer('audio/mpeg');
                this.sourceBuffer.addEventListener('updateend', () => {
                    this.isAppending = false;
                    this.processQueue();
                });
                
                await this.fetchAndAppendChunks();
                this.audio.play();
                updateStatus('mse', '再生中', 'playing');
            });
        } catch (error) {
            updateStatus('mse', 'エラー: ' + error.message, 'error');
            toggleButtons('mse', false);
        }
    }

    async fetchAndAppendChunks() {
        const response = await fetch('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3');
        const reader = response.body.getReader();
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            this.queue.push(value);
            this.processQueue();
        }
    }

    processQueue() {
        if (this.isAppending || this.queue.length === 0) return;
        
        this.isAppending = true;
        const chunk = this.queue.shift();
        this.sourceBuffer.appendBuffer(chunk);
    }

    stop() {
        this.audio.pause();
        this.audio.src = '';
        if (this.mediaSource && this.mediaSource.readyState === 'open') {
            this.mediaSource.endOfStream();
        }
        updateStatus('mse', '停止', '');
    }
}

// Basic HTML5 Audio Streaming
class HTML5Streamer {
    constructor() {
        this.audio = document.getElementById('html5Audio');
    }

    start() {
        this.audio.src = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3';
        this.audio.play();
        updateStatus('html5', '再生中', 'playing');
        
        this.audio.addEventListener('ended', () => {
            updateStatus('html5', '再生完了', '');
            toggleButtons('html5', false);
        });
        
        this.audio.addEventListener('error', (e) => {
            updateStatus('html5', 'エラー: ' + e.message, 'error');
            toggleButtons('html5', false);
        });
    }

    stop() {
        this.audio.pause();
        this.audio.src = '';
        updateStatus('html5', '停止', '');
    }
}

// Chunked Audio Delivery
class ChunkedStreamer {
    constructor() {
        this.audioContext = null;
        this.chunks = [];
        this.currentChunk = 0;
        this.isPlaying = false;
    }

    async start() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            updateStatus('chunked', 'チャンクを読み込み中...', 'loading');
            
            // Simulate chunked delivery
            const response = await fetch('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3');
            const arrayBuffer = await response.arrayBuffer();
            
            // Split into chunks (simulate)
            const chunkSize = Math.floor(arrayBuffer.byteLength / 10);
            for (let i = 0; i < arrayBuffer.byteLength; i += chunkSize) {
                this.chunks.push(arrayBuffer.slice(i, i + chunkSize));
            }
            
            updateStatus('chunked', '再生中', 'playing');
            this.playNextChunk();
        } catch (error) {
            updateStatus('chunked', 'エラー: ' + error.message, 'error');
            toggleButtons('chunked', false);
        }
    }

    async playNextChunk() {
        if (this.currentChunk >= this.chunks.length || !this.isPlaying) {
            updateStatus('chunked', '再生完了', '');
            toggleButtons('chunked', false);
            return;
        }

        try {
            const audioBuffer = await this.audioContext.decodeAudioData(
                this.chunks[this.currentChunk].slice(0)
            );
            
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioContext.destination);
            source.start();
            
            source.onended = () => {
                this.currentChunk++;
                const progress = (this.currentChunk / this.chunks.length) * 100;
                document.getElementById('chunkedProgress').value = progress;
                this.playNextChunk();
            };
        } catch (error) {
            // Skip invalid chunks
            this.currentChunk++;
            this.playNextChunk();
        }
    }

    stop() {
        this.isPlaying = false;
        if (this.audioContext) {
            this.audioContext.close();
        }
        document.getElementById('chunkedProgress').value = 0;
        updateStatus('chunked', '停止', '');
    }
}

// Utility functions
function updateStatus(method, text, className) {
    const status = document.getElementById(method + 'Status');
    status.textContent = text;
    status.className = 'status ' + className;
}

function toggleButtons(method, isPlaying) {
    document.getElementById(method + 'Btn').disabled = isPlaying;
    document.getElementById(method + 'StopBtn').disabled = !isPlaying;
}

// Initialize streamers
const streamers = {
    webAudio: new WebAudioStreamer(),
    hls: new HLSStreamer(),
    mse: new MSEStreamer(),
    html5: new HTML5Streamer(),
    chunked: new ChunkedStreamer()
};

// Event listeners
document.getElementById('webAudioBtn').addEventListener('click', () => {
    toggleButtons('webAudio', true);
    streamers.webAudio.start();
});

document.getElementById('webAudioStopBtn').addEventListener('click', () => {
    toggleButtons('webAudio', false);
    streamers.webAudio.stop();
});

document.getElementById('hlsBtn').addEventListener('click', () => {
    toggleButtons('hls', true);
    streamers.hls.start();
});

document.getElementById('hlsStopBtn').addEventListener('click', () => {
    toggleButtons('hls', false);
    streamers.hls.stop();
});

document.getElementById('mseBtn').addEventListener('click', () => {
    toggleButtons('mse', true);
    streamers.mse.start();
});

document.getElementById('mseStopBtn').addEventListener('click', () => {
    toggleButtons('mse', false);
    streamers.mse.stop();
});

document.getElementById('html5Btn').addEventListener('click', () => {
    toggleButtons('html5', true);
    streamers.html5.start();
});

document.getElementById('html5StopBtn').addEventListener('click', () => {
    toggleButtons('html5', false);
    streamers.html5.stop();
});

document.getElementById('chunkedBtn').addEventListener('click', () => {
    toggleButtons('chunked', true);
    streamers.chunked.isPlaying = true;
    streamers.chunked.start();
});

document.getElementById('chunkedStopBtn').addEventListener('click', () => {
    toggleButtons('chunked', false);
    streamers.chunked.stop();
});