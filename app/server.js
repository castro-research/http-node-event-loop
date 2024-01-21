import http from 'node:http'

async function getData() {
    const data = await fetch('https://jsonplaceholder.typicode.com/todos/1')
    return data.json()
}

const server = http.createServer(async (_, res) => {
    debugger
    const response = await getData()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.write(JSON.stringify(response))
    res.end()
})

server.listen(3000)

server.on('connection', () => {
    debugger
    console.log('connection received')
});

server.on('request', () => {
    debugger
    console.log('Request received')
});
  