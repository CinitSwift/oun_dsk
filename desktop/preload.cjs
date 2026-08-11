const { contextBridge } = require('electron')

const proxyArgument = process.argv.find((argument) => argument.startsWith('--oun-proxy-url='))
const proxyUrl = proxyArgument ? proxyArgument.slice('--oun-proxy-url='.length) : ''

contextBridge.exposeInMainWorld(
  'ounDesktop',
  Object.freeze({
    proxyUrl,
  }),
)
