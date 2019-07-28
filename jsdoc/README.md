# Super Scaled Sockets

### What is Super Scaled Sockets?

Super Scaled Sockets is a websockets framework allowing developers to easily scale up using multiple websocket server instances to serve a high number of clients.


### What do I need to scale my App?

The server instances are connected by the scalar object. This is decoupled from the rest of the library as I wanted to allow the ability to use the library with different stacks. Currently I have developed only one scaler which works with a MongoDb and Redis Pub/Sub Stack. But this should be easily copied and changed to support different technologies.


### How do the server and client communicate?

With Super Scaled sockets, the client has two methods of communication with the server:

* The Ask & Tell Methods: The client can make ask and tell calls to the server. The server can only make tell calls to clients
* Channels: Subscribe and Publish the clients can subscribe to channels and the server can publish on these channels - This will publish to any clients subscribed to the channel on any server instance

### How about load balancing?

This library does not include a load balancer. There are many good solutions for load balancing WebSocket instances. No sticky sessions are required for use with this library. Look into NGINX etc.

### What if the client disconnects? Does SSS have reconnection logic?

Yes! Super Scaled Sockets has built in reconnection logic, so if a user disconnects, they will attempt to reconnect and upon them successfully reconnecting the clients subscriptions are parsed and synced.


This library is built on top of the WebSockets node protocol implemented by node-ws.

# Getting Started

### Instalation

#### Server
On nmp run the following command:
~~~~
npm install super-scaled-sockets
~~~~

#### Client
On nmp run the following command:
~~~~
npm install super-scaled-sockets-client
~~~~

### Adding to your nodeJs server app

~~~~
sss = require('super-scaled-sockets-client');

sss.mongoRedis(mrPrefs, (err, scaler) => {
  if (err) {
    console.log('unable to connect to scaler');
    return;
  }
  const server = sss.server(scaler, {})
  server.connect(() => {

  }
}

~~~~

### Adding to your client app

~~~~
import sssc from 'super-scaled-sockets';

const client = sssc.client('localhost:443, {});
client.connect((err) => {

});
~~~~