# The NodeJS Event Loop - Http

A while ago, I was streaming on YouTube about exploring Node.js internals to understand how things work under the hood. You can find the stream here: [Exploring NodeJS Internals](https://www.youtube.com/watch?v=WjmpCEQb5Ak).

An interesting aspect I demonstrated was that when reading small, medium, and large files asynchronously, the console output appears only after all buffers are filled. You can check this out in the video.

Later, I watched Matteo Collina's video titled "Do Not Thrash the Node.js Event Loop," available here: [Do Not Thrash the Node.js Event Loop](https://www.youtube.com/watch?v=VI29mUA8n9w). This led me to wonder: what happens if 5 HTTP requests reach Node.js simultaneously, without any load balancer?

Let's deep dive into it.

First, i will create a minimum http server called `server.js` in `app` folder.

Following the example:

```javascript
import http from 'node:http'

async function getData() {
    const data = await fetch('https://jsonplaceholder.typicode.com/todos/1')
    return data.json()
}

const server = http.createServer(async (_, res) => {
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
```

run server with inspect and run on bash:

```bash
~ curl http://localhost:3000/1 & curl http://localhost:3000/2 & curl http://localhost:3000/3 &

[1] 38979
[2] 38980
[3] 38981
```

First of all, our server is a (Event Emitter)[https://nodejs.org/en/learn/asynchronous-work/the-nodejs-event-emitter]

```bash
resource.owner._eventsCount
3

resource.owner.__proto__
Server {close: ƒ, closeAllConnections: ƒ, closeIdleConnections: ƒ, setTimeout: ƒ, constructor: ƒ, …}

resource.owner.__proto__.__proto__
EventEmitter {_listen2: ƒ, listen: ƒ, address: ƒ, getConnections: ƒ, …}
```

Also, each TCP connection is also a Event Emitter with asyncId

```bash
asyncId
96

args[1]
TCP {reading: true, onconnection: null, _consumed: true, Symbol(owner_symbol): Socket, writeQueueSize: 0, …}
```

Based of this information until now, we have 3 TCP connection (on server symbol), and we are processing the first one, stopped on debugger, and all of 3 request is pending on terminal yet. 

So, all request is moved to event loop and register the callback to execute (the function we wrote to execute). 

Event Emitter has listeners, so each listener (if exist) will be called based on node http lifecycle.

We can move between call stack and check that we have 3 function to be executed, each one will be called and disposed. 

```bash
~ listeners
(2) [ƒ, ƒ, ƒ]
0: ƒ connectionListener(socket)1: () => {     debugger     console.log('Request received') }length: 3[[Prototype]]: Array(0)
```

Before execute the next callback ( inside createServer ), we have 2 pending `on.('connection')` to execute. It makes sense, all new connection should execute a callback registered on listener.

After all 3 request callback `on.('connection')` executed, now we will execute the current callback ( inside the createServer ), but we have a `promise` here.

```javascript
const response = await getData()
```

what will happen here ? stop receive connection ? stop all process until get the response ?

Not at all, we will schedule the getData, and continue our work.

while we don't have the promise result, will it trigger the last callback of our listeners ?

No, we received more request, right? even we solve all `on.('connection')`, we need execute the `on.('request')` ( because we have registered ).

But will we execute all 3 `on.('request')` at the same time now ? it depends if we have works done or not. if the (Node Http undici)[https://github.com/nodejs/undici] call was completed ( the first one, remember ?) we need to delivery response and pop this async task from our stack.

I know it hard to understand, but let's follow the STDOUT:

- connection received (#1 event)

- connection received (#2 event)

- I will process the callback of createServer

- It has a promise, let's schedule and go to next listener (#1 promise)

- Request received (#1 event)

- connection received (#3 event)

- I have the #1 promise done, let's ship

- execute next block code after `await`

```javascript
res.writeHead(200, { 'Content-Type': 'application/json' })
res.write(JSON.stringify(response))
res.end()
```

- I will process the callback of createServer (#2 event)

- It has a promise, let's schedule and go to next listener (#1 promise)

- Request received (#2 event)

And go on...

I composed this text while meticulously observing the debugger, step-by-step, delving into Node.js internals. This process was quite time-consuming.

Additionally, there are numerous concepts related to async_hooks, which I haven't detailed here.

However, the primary objective of my research was to gain a thorough understanding of the workings of Node.js HTTP, and in that regard, I have successfully achieved my goal

# References

https://nodesource.com/blog/event-loop-utilization-nodejs/

https://nodejs.org/en/learn/asynchronous-work/overview-of-blocking-vs-non-blocking
