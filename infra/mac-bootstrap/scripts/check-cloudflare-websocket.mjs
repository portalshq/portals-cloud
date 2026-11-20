#!/usr/bin/env node
const endpoint = process.env.EBOOK_WEBSOCKET_URL
  || 'wss://25thchapter.portals.works/ws?channelId=25th-chapter'
const timeout = setTimeout(() => {
  console.error('EBOOK_WEBSOCKET=TIMEOUT')
  process.exit(1)
}, 15_000)

const socket = new WebSocket(endpoint)
socket.addEventListener('open', () => {
  clearTimeout(timeout)
  console.log('EBOOK_WEBSOCKET=PASS')
  socket.close(1000, 'routing check complete')
})
socket.addEventListener('error', () => {
  clearTimeout(timeout)
  console.error('EBOOK_WEBSOCKET=FAIL')
  process.exit(1)
})
socket.addEventListener('close', () => {
  clearTimeout(timeout)
  process.exit(process.exitCode || 0)
})
