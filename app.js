// Configuration for Workers endpoint
const WORKER_URL = "https://audio-stream-proxy.ikisuketestapp.workers.dev"; // Replace with your Workers URL

// Web Audio API Streaming Implementation
class WebAudioStreamer {
  constructor() {
    this.audioContext = null;
    this.isPlaying = false;
    this.scheduledTime = 0;
    this.accumulatedData = new Uint8Array(0);
    this.minDecodeSize = 524288; // 512KB for reliable MP3 frame boundaries
    this.scheduleAheadTime = 0.1; // Schedule 100ms ahead
    this.activeSources = [];
  }

  async start() {
    try {
      this.audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      
      updateStatus("webAudio", "ストリーミング開始...", "loading");
      
      // Use the new streaming endpoint
      const response = await fetch(`${WORKER_URL}/stream/audio/2`);
      const reader = response.body.getReader();
      
      this.isPlaying = true;
      this.scheduledTime = 0;
      
      // Start reading and playing chunks
      this.processStream(reader);
      
      updateStatus("webAudio", "ストリーミング中", "playing");
    } catch (error) {
      updateStatus("webAudio", "エラー: " + error.message, "error");
      toggleButtons("webAudio", false);
    }
  }
  
  async processStream(reader) {
    let totalReceived = 0;
    let lastDecodePosition = 0;
    
    while (this.isPlaying) {
      try {
        const { done, value } = await reader.read();
        
        if (done) {
          // Try to decode any remaining data
          if (this.accumulatedData.length > lastDecodePosition) {
            await this.tryDecodeSegment(this.accumulatedData, lastDecodePosition, this.accumulatedData.length);
          }
          
          // Wait for all audio to finish
          const maxEndTime = Math.max(...this.activeSources.map(s => s.endTime), 0);
          const waitTime = (maxEndTime - this.audioContext.currentTime) * 1000;
          if (waitTime > 0) {
            await new Promise(resolve => setTimeout(resolve, waitTime + 100));
          }
          
          updateStatus("webAudio", "ストリーミング完了", "");
          toggleButtons("webAudio", false);
          break;
        }
        
        // Append new data
        const newData = new Uint8Array(this.accumulatedData.length + value.length);
        newData.set(this.accumulatedData);
        newData.set(value, this.accumulatedData.length);
        this.accumulatedData = newData;
        totalReceived += value.length;
        
        // Try to decode when we have enough new data
        if (this.accumulatedData.length - lastDecodePosition >= this.minDecodeSize) {
          const decodeEnd = Math.floor(this.accumulatedData.length / this.minDecodeSize) * this.minDecodeSize;
          const decoded = await this.tryDecodeSegment(this.accumulatedData, lastDecodePosition, decodeEnd);
          if (decoded) {
            lastDecodePosition = decodeEnd;
          }
        }
      } catch (error) {
        console.error('Stream processing error:', error);
        updateStatus("webAudio", "ストリームエラー: " + error.message, "error");
        toggleButtons("webAudio", false);
        break;
      }
    }
    
    reader.cancel();
  }
  
  async tryDecodeSegment(data, start, end) {
    try {
      const segment = data.slice(start, end);
      const audioBuffer = await this.audioContext.decodeAudioData(segment.buffer.slice(0));
      
      if (audioBuffer.length > 0) {
        this.schedulePlayback(audioBuffer);
        return true;
      }
    } catch (error) {
      console.log(`Decode failed for segment ${start}-${end}, will retry with more data`);
    }
    return false;
  }
  
  schedulePlayback(audioBuffer) {
    if (!this.isPlaying) return;
    
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);
    
    const now = this.audioContext.currentTime;
    
    // Initialize scheduled time
    if (this.scheduledTime === 0) {
      this.scheduledTime = now + this.scheduleAheadTime;
    }
    
    // Make sure we don't schedule in the past
    if (this.scheduledTime < now) {
      this.scheduledTime = now;
    }
    
    const startTime = this.scheduledTime;
    source.start(startTime);
    
    // Track active sources
    const sourceInfo = {
      source,
      startTime,
      endTime: startTime + audioBuffer.duration
    };
    this.activeSources.push(sourceInfo);
    
    source.onended = () => {
      this.activeSources = this.activeSources.filter(s => s.source !== source);
    };
    
    // Update scheduled time for next buffer
    this.scheduledTime = startTime + audioBuffer.duration;
  }

  stop() {
    this.isPlaying = false;
    
    // Stop all active sources
    this.activeSources.forEach(({ source }) => {
      try {
        source.stop();
      } catch (e) {}
    });
    this.activeSources = [];
    
    this.accumulatedData = new Uint8Array(0);
    if (this.audioContext) {
      this.audioContext.close();
    }
    updateStatus("webAudio", "停止", "");
  }
}

// HLS Implementation
class HLSStreamer {
  constructor() {
    this.hls = null;
    this.audio = document.getElementById("hlsAudio");
  }

  start() {
    if (Hls.isSupported()) {
      this.hls = new Hls();
      // Using a public HLS stream for demo
      this.hls.loadSource(`https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8`);
      this.hls.attachMedia(this.audio);

      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        this.audio.play();
        updateStatus("hls", "再生中", "playing");
      });

      this.hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          updateStatus("hls", "エラー: " + data.type, "error");
          toggleButtons("hls", false);
        }
      });
    } else if (this.audio.canPlayType("application/vnd.apple.mpegurl")) {
      // For Safari native HLS support
      this.audio.src = `https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8`;
      this.audio.play();
      updateStatus("hls", "再生中 (Native)", "playing");
    } else {
      updateStatus("hls", "HLSはサポートされていません", "error");
      toggleButtons("hls", false);
    }
  }

  stop() {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    this.audio.pause();
    this.audio.src = "";
    updateStatus("hls", "停止", "");
  }
}

// Media Source Extensions Implementation
class MSEStreamer {
  constructor() {
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.audio = document.getElementById("mseAudio");
    this.queue = [];
    this.isAppending = false;
    this.reader = null;
    this.isStreaming = false;
    this.hasStartedPlayback = false;
    this.totalBytesAppended = 0;
    this.minPlaybackBuffer = 524288; // 512KB before starting playback for smooth streaming
    this.appendThreshold = 1048576; // 1MB buffer in source buffer
  }

  async start() {
    try {
      this.mediaSource = new MediaSource();
      this.audio.src = URL.createObjectURL(this.mediaSource);
      this.isStreaming = true;

      this.mediaSource.addEventListener("sourceopen", async () => {
        try {
          this.sourceBuffer = this.mediaSource.addSourceBuffer("audio/mpeg");
          this.sourceBuffer.mode = "sequence"; // Important for streaming
          
          // Set up event listeners
          this.sourceBuffer.addEventListener("updateend", () => {
            this.isAppending = false;
            this.processQueue();
            
            // Start playback once we have enough data
            if (!this.hasStartedPlayback && this.totalBytesAppended >= this.minPlaybackBuffer) {
              this.hasStartedPlayback = true;
              this.audio.play().then(() => {
                updateStatus("mse", "再生中", "playing");
              }).catch(e => {
                console.error("Playback failed:", e);
              });
            }
          });

          this.sourceBuffer.addEventListener("error", (e) => {
            console.error("SourceBuffer error:", e);
          });

          // Monitor buffer and remove old data to prevent quota exceeded
          this.audio.addEventListener('timeupdate', () => {
            if (this.sourceBuffer && !this.sourceBuffer.updating && this.audio.currentTime > 30) {
              try {
                // Remove data that's more than 20 seconds behind current time
                const removeEnd = Math.max(0, this.audio.currentTime - 20);
                if (removeEnd > 0) {
                  this.sourceBuffer.remove(0, removeEnd);
                }
              } catch (e) {
                console.log("Could not remove old buffer data:", e);
              }
            }
          });

          // Start fetching and appending chunks
          await this.fetchAndAppendChunks();
        } catch (error) {
          console.error("SourceBuffer setup error:", error);
          updateStatus("mse", "バッファエラー: " + error.message, "error");
          toggleButtons("mse", false);
        }
      });

      this.mediaSource.addEventListener("sourceended", () => {
        updateStatus("mse", "ストリーミング完了", "");
        toggleButtons("mse", false);
      });

      updateStatus("mse", "バッファリング中...", "loading");
    } catch (error) {
      updateStatus("mse", "エラー: " + error.message, "error");
      toggleButtons("mse", false);
    }
  }

  async fetchAndAppendChunks() {
    try {
      const response = await fetch(`${WORKER_URL}/stream/audio/2`);
      this.reader = response.body.getReader();
      
      // Accumulate chunks until we have enough for smooth playback
      let accumulatedChunks = [];
      let accumulatedSize = 0;

      while (this.isStreaming) {
        const { done, value } = await this.reader.read();
        
        if (done) {
          // Append any remaining accumulated chunks
          if (accumulatedChunks.length > 0) {
            const combined = this.combineChunks(accumulatedChunks, accumulatedSize);
            this.queue.push(combined);
            this.processQueue();
          }
          
          // Wait for any pending appends to complete
          while (this.queue.length > 0 || this.isAppending) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          
          if (this.mediaSource.readyState === "open") {
            this.mediaSource.endOfStream();
          }
          break;
        }

        // Accumulate chunks
        accumulatedChunks.push(value);
        accumulatedSize += value.length;
        
        // When we have enough data, combine and queue
        if (accumulatedSize >= 131072) { // 128KB chunks
          const combined = this.combineChunks(accumulatedChunks, accumulatedSize);
          this.queue.push(combined);
          this.processQueue();
          
          // Reset accumulators
          accumulatedChunks = [];
          accumulatedSize = 0;
        }
        
        // Control flow to prevent overwhelming the buffer
        if (this.queue.length > 5 || (this.sourceBuffer && this.sourceBuffer.buffered.length > 0 && 
            this.sourceBuffer.buffered.end(0) - this.audio.currentTime > 10)) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    } catch (error) {
      console.error("Streaming error:", error);
      updateStatus("mse", "ストリームエラー: " + error.message, "error");
      toggleButtons("mse", false);
    }
  }

  combineChunks(chunks, totalSize) {
    const combined = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    return combined;
  }

  processQueue() {
    if (this.isAppending || this.queue.length === 0) return;
    if (!this.sourceBuffer || this.sourceBuffer.updating) return;
    
    // Check if we can append more data
    if (this.mediaSource.readyState !== "open") return;

    try {
      this.isAppending = true;
      const chunk = this.queue.shift();
      this.sourceBuffer.appendBuffer(chunk);
      this.totalBytesAppended += chunk.byteLength;
    } catch (error) {
      console.error("Append error:", error);
      this.isAppending = false;
      
      // If quota exceeded, wait a bit and retry
      if (error.name === "QuotaExceededError") {
        // Put chunk back and wait
        this.queue.unshift(chunk);
        setTimeout(() => {
          this.processQueue();
        }, 1000);
      }
    }
  }

  stop() {
    this.isStreaming = false;
    if (this.reader) {
      this.reader.cancel();
      this.reader = null;
    }
    
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    
    if (this.mediaSource && this.mediaSource.readyState === "open") {
      try {
        this.mediaSource.endOfStream();
      } catch (e) {
        console.error("Error ending stream:", e);
      }
    }
    
    this.queue = [];
    this.totalBytesAppended = 0;
    this.hasStartedPlayback = false;
    updateStatus("mse", "停止", "");
  }
}

// Basic HTML5 Audio Streaming
class HTML5Streamer {
  constructor() {
    this.audio = document.getElementById("html5Audio");
  }

  start() {
    this.audio.src = `${WORKER_URL}/audio/3`;
    this.audio.play();
    updateStatus("html5", "再生中", "playing");

    this.audio.addEventListener("ended", () => {
      updateStatus("html5", "再生完了", "");
      toggleButtons("html5", false);
    });

    this.audio.addEventListener("error", (e) => {
      updateStatus("html5", "エラー: " + e.message, "error");
      toggleButtons("html5", false);
    });
  }

  stop() {
    this.audio.pause();
    this.audio.src = "";
    updateStatus("html5", "停止", "");
  }
}

// Chunked Audio Delivery
class ChunkedStreamer {
  constructor() {
    this.audioContext = null;
    this.isPlaying = false;
    this.reader = null;
    this.scheduledTime = 0;
    this.accumulatedData = new Uint8Array(0);
    this.minDecodeSize = 524288; // 512KB for reliable decoding
    this.lastDecodePosition = 0;
    this.totalReceived = 0;
    this.chunksDecoded = 0;
    this.activeSources = [];
  }

  async start() {
    try {
      this.audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      this.isPlaying = true;
      
      updateStatus("chunked", "ストリーミング開始...", "loading");
      document.getElementById("chunkedProgress").value = 0;

      // Use streaming endpoint
      const response = await fetch(`${WORKER_URL}/stream/audio/4`);
      this.reader = response.body.getReader();
      
      this.scheduledTime = 0;
      
      // Start streaming and processing
      this.streamChunks();
      
      updateStatus("chunked", "ストリーミング中", "playing");
    } catch (error) {
      updateStatus("chunked", "エラー: " + error.message, "error");
      toggleButtons("chunked", false);
    }
  }

  async streamChunks() {
    while (this.isPlaying) {
      try {
        const { done, value } = await this.reader.read();
        
        if (done) {
          // Try to decode any remaining data
          if (this.accumulatedData.length > this.lastDecodePosition) {
            await this.tryDecodeAndPlay(this.lastDecodePosition, this.accumulatedData.length, true);
          }
          
          // Wait for all audio to finish
          const maxEndTime = Math.max(...this.activeSources.map(s => s.endTime), 0);
          const waitTime = (maxEndTime - this.audioContext.currentTime) * 1000;
          if (waitTime > 0) {
            await new Promise(resolve => setTimeout(resolve, waitTime + 100));
          }
          
          updateStatus("chunked", "ストリーミング完了", "");
          toggleButtons("chunked", false);
          document.getElementById("chunkedProgress").value = 100;
          break;
        }
        
        // Append new data efficiently
        const newData = new Uint8Array(this.accumulatedData.length + value.length);
        newData.set(this.accumulatedData);
        newData.set(value, this.accumulatedData.length);
        this.accumulatedData = newData;
        this.totalReceived += value.length;
        
        // Update progress based on data received
        const receiveProgress = Math.min((this.totalReceived / 5000000) * 100, 90); // Assume ~5MB file
        document.getElementById("chunkedProgress").value = receiveProgress;
        
        // Try to decode when we have enough new data
        if (this.accumulatedData.length - this.lastDecodePosition >= this.minDecodeSize) {
          // Find decode boundary (multiple of minDecodeSize)
          const decodeEnd = Math.floor(this.accumulatedData.length / this.minDecodeSize) * this.minDecodeSize;
          const success = await this.tryDecodeAndPlay(this.lastDecodePosition, decodeEnd, false);
          if (success) {
            this.lastDecodePosition = decodeEnd;
          }
        }
      } catch (error) {
        console.error('Chunk streaming error:', error);
        updateStatus("chunked", "ストリームエラー: " + error.message, "error");
        toggleButtons("chunked", false);
        break;
      }
    }
    
    if (this.reader) {
      this.reader.cancel();
    }
  }

  async tryDecodeAndPlay(start, end, isFinal) {
    try {
      const segment = this.accumulatedData.slice(start, end);
      const audioBuffer = await this.audioContext.decodeAudioData(segment.buffer.slice(0));
      
      if (audioBuffer.length > 0) {
        this.schedulePlayback(audioBuffer);
        this.chunksDecoded++;
        return true;
      }
    } catch (error) {
      if (isFinal) {
        console.error('Failed to decode final chunk:', error);
      } else {
        console.log(`Waiting for more data to decode segment ${start}-${end}`);
      }
    }
    return false;
  }

  schedulePlayback(audioBuffer) {
    if (!this.isPlaying) return;
    
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);
    
    const now = this.audioContext.currentTime;
    
    // Initialize scheduled time with small buffer
    if (this.scheduledTime === 0) {
      this.scheduledTime = now + 0.1;
    }
    
    // Ensure we don't schedule in the past
    if (this.scheduledTime < now) {
      this.scheduledTime = now;
    }
    
    const startTime = this.scheduledTime;
    source.start(startTime);
    
    // Track active sources
    const sourceInfo = {
      source,
      startTime,
      endTime: startTime + audioBuffer.duration
    };
    this.activeSources.push(sourceInfo);
    
    source.onended = () => {
      this.activeSources = this.activeSources.filter(s => s.source !== source);
      
      // Update progress based on playback completion
      if (this.chunksDecoded > 0) {
        const playbackProgress = Math.min(
          90 + (10 * (this.chunksDecoded - this.activeSources.length) / this.chunksDecoded),
          100
        );
        document.getElementById("chunkedProgress").value = playbackProgress;
      }
    };
    
    // Update scheduled time for seamless playback
    this.scheduledTime = startTime + audioBuffer.duration;
  }

  stop() {
    this.isPlaying = false;
    
    // Stop all active sources
    this.activeSources.forEach(({ source }) => {
      try {
        source.stop();
      } catch (e) {}
    });
    this.activeSources = [];
    
    if (this.reader) {
      this.reader.cancel();
      this.reader = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
    
    this.accumulatedData = new Uint8Array(0);
    this.lastDecodePosition = 0;
    this.totalReceived = 0;
    this.chunksDecoded = 0;
    document.getElementById("chunkedProgress").value = 0;
    updateStatus("chunked", "停止", "");
  }
}

// Utility functions
function updateStatus(method, text, className) {
  const status = document.getElementById(method + "Status");
  status.textContent = text;
  status.className = "status " + className;
}

function toggleButtons(method, isPlaying) {
  document.getElementById(method + "Btn").disabled = isPlaying;
  document.getElementById(method + "StopBtn").disabled = !isPlaying;
}

// Initialize streamers
const streamers = {
  webAudio: new WebAudioStreamer(),
  hls: new HLSStreamer(),
  mse: new MSEStreamer(),
  html5: new HTML5Streamer(),
  chunked: new ChunkedStreamer(),
};

// Event listeners
document.getElementById("webAudioBtn").addEventListener("click", () => {
  toggleButtons("webAudio", true);
  streamers.webAudio.start();
});

document.getElementById("webAudioStopBtn").addEventListener("click", () => {
  toggleButtons("webAudio", false);
  streamers.webAudio.stop();
});

document.getElementById("hlsBtn").addEventListener("click", () => {
  toggleButtons("hls", true);
  streamers.hls.start();
});

document.getElementById("hlsStopBtn").addEventListener("click", () => {
  toggleButtons("hls", false);
  streamers.hls.stop();
});

document.getElementById("mseBtn").addEventListener("click", () => {
  toggleButtons("mse", true);
  streamers.mse.start();
});

document.getElementById("mseStopBtn").addEventListener("click", () => {
  toggleButtons("mse", false);
  streamers.mse.stop();
});

document.getElementById("html5Btn").addEventListener("click", () => {
  toggleButtons("html5", true);
  streamers.html5.start();
});

document.getElementById("html5StopBtn").addEventListener("click", () => {
  toggleButtons("html5", false);
  streamers.html5.stop();
});

document.getElementById("chunkedBtn").addEventListener("click", () => {
  toggleButtons("chunked", true);
  streamers.chunked.isPlaying = true;
  streamers.chunked.start();
});

document.getElementById("chunkedStopBtn").addEventListener("click", () => {
  toggleButtons("chunked", false);
  streamers.chunked.stop();
});
