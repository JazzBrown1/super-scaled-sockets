<a name="intro"></a>

# ARCHIVED - NO LONGER SUPPORTED!

# Super Scaled Sockets

### Table of contents

1. [ Introduction](#introduction)
2. [ Installation](#getting-started)
3. [ Scaler](#scaler)
4. [ Adding to your app](#adding)
5. [ Subscriptions](#subscriptions)
6. [ Ask and Tell](#ask-and-tell)
7. [ Session Parsing](#session-parser)
8. [ Subscription Parsing](#subscription-parser)
8. [ Resources](#resources)

<a name="introduction"></a>

### What is Super Scaled Sockets?

Super Scaled Sockets allows developers to easily scale up using multiple websocket server instances to serve a high number of clients.

Even if you do not envision a high number of users using your app, it is still recommended that you use multiple instances to serve your clients. This is so that if one of your instances falls over the others can manage the load while the instance is restarted.


### What do I need to scale my App?

The server instances are connected by the scalar. At the moment there is only one scaler developed which uses MongoDb and Redis. But this should be easily copied and changed to support different technologies.


### How do the server and client communicate?

With Super Scaled sockets, the client has two methods of communication with the server:

* The Ask & Tell Methods: The client can make ask and tell calls to the server. The server can only make tell calls to clients.
* Channels: Subscribe and Publish the clients can subscribe to channels and the server can publish on these channels - This will publish to any clients subscribed to the channel on any server instance.

### How about load balancing?

This library does not include a load balancer. There are many good solutions for load balancing WebSocket instances. No sticky sessions are required for use with this library. Look into NGINX etc.

### What if the client disconnects? Does SSS have reconnection logic?

Yes! Super Scaled Sockets has built in reconnection logic, so if a user disconnects, they will attempt to reconnect and upon them successfully reconnecting the clients subscriptions are parsed and synced.


This library is built on top of the WebSockets node protocol implemented by node-ws.

<a name="getting-started"></a>

# Getting Started

### Installation

#### Server
On nmp run the following command:
~~~~
npm install super-scaled-sockets
~~~~

And install the scaler: (more info below)
~~~~
npm install sss-mongo-redis
~~~~

#### Client
On nmp run the following command:
~~~~
npm install super-scaled-sockets-client
~~~~

<a name="scaler"></a>

### Scaler

The scaler is a vital part of Super Scaled Sockets and is what connects your different web sockets to each other.

To use super scaled sockets you will require the dependant technologies of the scaler. At the moment the only scaler available is the mongoRedis scaler for which you will need an instance of redis and a a mongDB database instance. RedisLabs and MongoAtlas provide great cloud platforms that are free for development use and are very easy to set up.

MongoDB Atlas: [https://www.mongodb.com](https://www.mongodb.com)

RedisLabs: [https://redislabs.com/](https://redislabs.com/)

Once you have set these up just take a note of the connection credentials which will be used to connect your scaler on the server.

And in your server code pass the credentials to the scaler.connect and that will return the scaler object. This should be passed to sss.client to create your client instance.

~~~
const sss = require('super-scaled-sockets');
const mongoRedis = require('sss-mongo-redis');

// mongo connection info all properties are required
const mongoConnection = {
  uri: 'mongodb+srv://smartUsername:smartPassword@cluster0-abcd.zyx.mongodb.net/test?retryWrites=true',
  dbName: 'redis',
  collectionName: 'redis'
};

// redis connection Info all properties are required
const redisConnection = {
  password: 'ABCDefGH1234567890ZYXWvu',
  host: 'redis-123456.z9.us-east-1-0.ec2.cloud.redislabs.com',
  port: 123456
};

mongoRedis.connect(mongoConnection, redisConnection, (err, scaler) => {
  if (err) {
    console.log('Error establishing scaler connection');
    return;
  }
  const client = sss.client(scaler, {})
  client.connect((error) => {
    // ......
~~~

<a name="adding"></a>

### Adding to your nodeJs server app

When adding the Super Scaled sockets, you must ensure you have all of the credentials to begin your scaler connection. There are no required options to start your server instance, but you will see in the below example we have passed the port number into the options object which we have got from the cml argument to start the node instance. Depending on your load balancer you may use a different method to define this. By default if undefined in the options the server instance will use port 443 to begin.

~~~~
import sss from 'super-scaled-sockets';
import mongoRedis from 'sss-mongo-redis';

// We take the port to run our server instance on from the first argument in the node call in cl
const port = process.argv[2];

// mongo connection info all properties are required
const mongoConnection = {
  uri: 'mongodb+srv://smartUsername:smartPassword@cluster0-abcd.zyx.mongodb.net/test?retryWrites=true',
  dbName: 'redis',
  collectionName: 'redis'
};

// redis connection Info all properties are required
const redisConnection = {
  password: 'ABCDefGH1234567890ZYXWvu',
  host: 'redis-123456.z9.us-east-1-0.ec2.cloud.redislabs.com',
  port: 123456
};

const options = {
  port: port
};

mongoRedis.connect(mongoConnection, redisConnection, (err, scaler) => {
  if (err) {
    console.log('Error establishing scaler connection');
    return;
  }
  // Make a server instance
  const server = sss.server(scaler, options);
  // Open the sss connection
  server.connect((err) => {
    if (err) {
      console.log('Error opening super scaled sockets');
      return;
    }
    // .......
~~~~

### Adding to your client app

To connect your client to your server all you will require is the URL of your server. This will normally be the URL of you Load Balancer. You can provide additional options, please see the docs for more information.

~~~~
import sssc from 'super-scaled-sockets-client';

const client = sssc.client('localhost:443', {});
client.connect((err) => {
  if (err) {
    console.log('Error opening super scaled sockets');
    return;
  }
  // .......
~~~~

<a name="subscriptions"></a>

### Subscriptions

Subscriptions are where the true power of super scaled sockets can be utilized. Any server instance can publish on a channel and any socket subscribed to that channel will receive that message. This allows apps to serve a very high number of clients allowing real time communication between them.

Client:
~~~
client.subscribe('sport', null, (err, sport) => {
  // The second argument is the query this can be used for passwords etc for secure subscriptions
  if(err) {
    alert('error - unable to connect to sport channel');
    return;
  }
  sport.on('article', (msg) => {
    displayArticle(msg);
  });
});

~~~

Server:
~~~
const publishSportArticle = (article) => {
  server.publish('sport', 'article', article);
}
~~~

<a name="ask-and-tell"></a>

### Ask & Tell Protocols

These act similar to POST and UPDATE http requests. If the client requires information from the server it can call client.ask() and if it just needs to deliver information to the server it can call client.tell().

#### Ask

Client:
~~~
client.ask('serverTime', null, (err, response) => {
  if (!err) displayTime(response);
});
~~~

Server:
~~~
socket.onAsk('serverTime', (msg, response) => {
  response.send(Date.now());
});
~~~

#### Tell (Client)

Client:
~~~
const likeMessage = (messageId) => {
  client.tell('likedMsg', messageId, (err) => {
    if (!err) showThumbsUp(messageId);
  });
}
~~~

Server:
~~~
socket.onTell('likedMsg', (msg) => {
  handleLikedMessage(msg);
});
~~~

<a name="session-parser"></a>

### Session Parser

The session parser allows you to add a security layer to your server and is called when any new client tries to make a connection. You can check cookies and origins in this function etc. You can also use this function to add a user id and/or a session ID so that SSS can make session and user subscriptions. Your session parser should be passed to the server object as in the example below. If a Session Parser is not set then all sessions are accepted and no user or session subscriptions are created.

~~~
const sessionParser = (request, done) => {
    const token = request.cookies.token;
    mongoSessions.validateToken(token, (__err, result) => {
      done(result.isValid, result.user, token);
    });
  }
const options = {
  sessionParser
  port: port
};
const server = sss.server(scaler, options);
server.connect((err) => {
  // .....
~~~

<a name="subscription-parser"></a>

### Subscription Parser

The Subscription Parser is called when a client makes a subscription request allowing you to add security to subscriptions. You can pass a query in the client request if information is needed from the client to parse the request (ex: password). If a Subscription Parser is not set then all subscription requests are accepted.

~~~
// Array of roomKeys
const roomKeys = ['Sport', 'Politics', 'Fashion'];
// Password for the private room
const privateRoomPw = '21sdf24dgFD1fd2df2';
// The subscription Parser function
const subscriptionParser = (socket, channelName, request, done) => {
  if (channelName === 'private') {
    done(privateRoomPw === request);
    return;
  }
  // returns false if the room ket is unknown
  done(roomKeys.includes(channelName));
};
// Include Subscription Parser in your options
const options = {subscriptionParser, port};
const server = sss.server(scaler, options);
server.connect((err) => {
  // .....
~~~

<a name="resources"></a>

## Resources

* Documentation [[client](https://super-scaled-sockets.tezle.com/docs/client/)] [[server](https://super-scaled-sockets.tezle.com/docs/server/)]
* Github [[client](https://github.com/JazzBrown1/super-scaled-sockets-client)] [[server](https://github.com/JazzBrown1/super-scaled-sockets)]
* NPM [[client](https://www.npmjs.com/package/super-scaled-sockets-client)] [[server](https://www.npmjs.com/package/super-scaled-sockets)]
* Issues [[client](https://github.com/JazzBrown1/super-scaled-sockets-client/issues)] [[server](https://github.com/JazzBrown1/super-scaled-sockets/issues)]
