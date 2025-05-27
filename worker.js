addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

const AUDIO_URLS = {
  '/audio/1': 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  '/audio/2': 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
  '/audio/3': 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
  '/audio/4': 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
  '/audio/hls': 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
}

async function handleRequest(request) {
  const url = new URL(request.url)
  const pathname = url.pathname

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (pathname.startsWith('/stream/')) {
    const audioPath = pathname.replace('/stream', '')
    if (AUDIO_URLS[audioPath]) {
      try {
        const audioUrl = AUDIO_URLS[audioPath]
        const response = await fetch(audioUrl)
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const reader = response.body.getReader()
        const CHUNK_SIZE = 16384 // 16KB chunks
        
        const stream = new ReadableStream({
          async start(controller) {
            const processChunk = async () => {
              try {
                const { done, value } = await reader.read()
                
                if (done) {
                  controller.close()
                  return
                }
                
                controller.enqueue(value)
                await new Promise(resolve => setTimeout(resolve, 10)) // Small delay to simulate streaming
                await processChunk()
              } catch (error) {
                controller.error(error)
              }
            }
            
            await processChunk()
          },
          
          cancel() {
            reader.cancel()
          }
        })
        
        const headers = new Headers({
          'Content-Type': response.headers.get('Content-Type') || 'audio/mpeg',
          'Cache-Control': 'no-cache',
          'Transfer-Encoding': 'chunked',
          ...corsHeaders
        })
        
        return new Response(stream, {
          status: 200,
          headers: headers
        })
      } catch (error) {
        return new Response('Stream error: ' + error.message, { 
          status: 500,
          headers: corsHeaders 
        })
      }
    }
  }
  
  if (AUDIO_URLS[pathname]) {
    try {
      const audioUrl = AUDIO_URLS[pathname]
      const response = await fetch(audioUrl)
      
      const headers = new Headers(response.headers)
      Object.entries(corsHeaders).forEach(([key, value]) => {
        headers.set(key, value)
      })
      
      return new Response(response.body, {
        status: response.status,
        headers: headers
      })
    } catch (error) {
      return new Response('Proxy error: ' + error.message, { 
        status: 500,
        headers: corsHeaders 
      })
    }
  }

  return new Response('Not found', { 
    status: 404,
    headers: corsHeaders 
  })
}