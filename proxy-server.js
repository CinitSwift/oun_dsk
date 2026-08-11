import express from 'express'
import cors from 'cors'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// 统一的代理处理逻辑
async function handleProxyRequest(targetUrl) {
  try {
    new URL(targetUrl)
  } catch {
    throw new Error('Invalid URL format')
  }

  const response = await fetch(targetUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
    },
    signal: AbortSignal.timeout(15000),
  })

  return response
}

export function createProxyApp() {
  const app = express()

  app.use(cors({ origin: '*' }))

  app.get('/proxy', async (req, res) => {
    try {
      const { url } = req.query
      if (!url) {
        return res.status(400).json({ error: 'URL parameter is required' })
      }

      const targetUrl = decodeURIComponent(url)
      const response = await handleProxyRequest(targetUrl)
      const text = await response.text()
      const contentType = response.headers.get('content-type') || 'application/json'

      res.setHeader('Content-Type', contentType)
      res.status(response.status).send(text)
    } catch (error) {
      res.status(500).json({
        error: 'Proxy request failed',
        message: error.message,
      })
    }
  })

  return app
}

export async function startProxyServer({ host = '127.0.0.1', port = 3001 } = {}) {
  const server = createProxyApp().listen(port, host)

  await new Promise((resolve, reject) => {
    function onError(error) {
      server.off('listening', onListening)
      reject(error)
    }

    function onListening() {
      server.off('error', onError)
      resolve()
    }

    server.once('listening', onListening)
    server.once('error', onError)
  })

  const address = server.address()
  const actualPort = typeof address === 'object' && address ? address.port : port
  const urlHost = host.includes(':') ? `[${host}]` : host
  let closePromise

  return {
    server,
    port: actualPort,
    url: `http://${urlHost}:${actualPort}`,
    close() {
      if (!closePromise) {
        closePromise = new Promise((resolve, reject) => {
          if (!server.listening) {
            resolve()
            return
          }

          server.close((error) => {
            if (error) {
              closePromise = undefined
              reject(error)
              return
            }

            resolve()
          })
        })
      }

      return closePromise
    },
  }
}

function isDirectExecution() {
  if (!process.argv[1]) {
    return false
  }

  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
  } catch {
    return false
  }
}

if (isDirectExecution()) {
  const port = Number(process.env.PROXY_PORT || 3001)

  startProxyServer({ host: '0.0.0.0', port })
    .then(({ port: listeningPort }) => {
      console.log(`Proxy server on :${listeningPort}`)
    })
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
}
