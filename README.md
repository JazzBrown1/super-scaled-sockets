# Super Scaled Sockets

### What is Super Scaled Sockets?

Super Scaled Sockets is a web sockets framework allowing developers to easily scale up using multiple websocket server instances to serve a high number of clients.


### What do I need to scale my App?

The server instances are connected by the scalar object. This is decoupled from the rest of the library as I wanted to allow the ability to use the library with different technologies. Currently I have developed only one scaler which works with a MongoDb and Redis Pub/Sub setup. But this should be easily copied and changed to support different technologies.


### How do the server and client communicate?

With Super Scaled sockets, the client has two methods of communication with the server:

* The Ask & Tell Methods: The client can make ask and tell calls to the server. The server can only make tell calls to clients.
* Channels: Subscribe and Publish the clients can subscribe to channels and the server can publish on these channels - This will publish to any clients subscribed to the channel on any server instance.

### How about load balancing?

This library does not include a load balancer. There are many good solutions for load balancing WebSocket instances. No sticky sessions are required for use with this library. Look into NGINX etc.

### What if the client disconnects? Does SSS have reconnection logic?

Yes! Super Scaled Sockets has built in reconnection logic, so if a user disconnects, they will attempt to reconnect and upon them successfully reconnecting the clients subscriptions are parsed and synced.


This library is built on top of the WebSockets node protocol implemented by node-ws.

# Getting Started

### Installation

#### Server
On nmp run the following command:
~~~~
npm install <Directory of the super-scaled-sockets Lib>
~~~~

#### Client
On nmp run the following command:
~~~~
npm install <Directory of the super-scaled-sockets-client Lib>
~~~~

### Scaler

The scaler is a vital part of Super Scaled Sockets and is what connects your different web sockets to each other.

To use super scaled sockets you will require the dependant technologies of the scaler. At the moment the only scaler available is the mongoRedis scaler for which you will need an instance of redis and a a mongDB database instance. RedisLabs and MongoAtlas provide great cloud platforms that are free for development use and are very easy to set up.

MongoDB Atlas: [https://www.mongodb.com](https://www.mongodb.com)

RedisLabs: [https://redislabs.com/](https://redislabs.com/)

Once you have set these up just take a note of the connection credentials which will be used to connect your scaler on the server.

~~~
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

sss.scaler.mongoRedis.connect(mongoConnection, redisConnection, (err, scaler) => {
  if (err) {
    console.log('Error establishing scaler connection');
    return;
  }
  // ......
~~~

### Adding to your nodeJs server app

When adding the Super Scaled sockets, you must ensure you have all of the credentials to begin your scaler connection. There are no required options to start your server instance, but you will see in the below example we have passed the port number into the options object which we have got from the cml argument to start the node instance. Depending on your load balancer you may use a different method to define this. By default if undefined in the options the server instance will use port 443 to begin.

~~~~
import sss from 'super-scaled-sockets';

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

sss.scaler.mongoRedis.connect(mongoConnection, redisConnection, (err, scaler) => {
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

### Subscription Parser

The Subscription Parser is called when a client makes a subscription request allowing you to add security to subscriptions. You can pass a query in the client request if information is needed from the client to parse the request (ex: password). If a Subscription Parser is not set then all subscription requests are accepted.

~~~
const privateRoomPw = '21sdf24dgFD1fd2df2';
const subscriptionParser = (socket, channel, request, callback) => {
  switch (channel) {
    case 'general_chat':
      callback(true);
      break;
    case 'sport':
      callback(true);
      break;
    case 'fashion':
      callback(true);
      break;
    case 'private':
      callback(privateRoomPw === request);
      break;
    default:
      callback(false);
      break;
  }
};
const options = {
  subscriptionParser
  port: port
};
const server = sss.server(scaler, options);
server.connect((err) => {
  // .....
~~~