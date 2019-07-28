/* eslint-disable no-param-reassign */
// LIBRARIES
const sss = require('../../src/superScaledSockets');

// We take the port to run our server on from the first arguement in the node call in cl
const port = process.argv[2] ? process.argv[2] : 443;

// mongo connection info all properties are required
const mongoConnection = {
  uri: 'mongodb+srv://smartusername:smartpassword@cluster0-abcd.zyx.mongodb.net/test?retryWrites=true',
  dbName: 'redis',
  collectionName: 'redis'
};

// redis connection Info all properties are required
const redisConnection = {
  password: 'ABCDefGH1234567890ZYXWvu',
  host: 'redis-123456.z9.us-east-1-0.ec2.cloud.redislabs.com',
  port: 123456
};

// Random display name functionality
const firstWord = ['Sneaky', 'Quick', 'Silver', 'Yellow', 'Red', 'Purple', 'Golden', 'Swifty'];
const secondWord = ['Rabbit', 'Fox', 'Squirrel', 'Panda', 'Monkey'];
const getRandomInt = (min, max) => {
  const _min = Math.ceil(min);
  const _max = Math.floor(max);
  return Math.floor(Math.random() * (_max - _min)) + _min;
};
const makeDisplayName = () => `${firstWord[getRandomInt(0, firstWord.length - 1)]} ${secondWord[getRandomInt(0, secondWord.length - 1)]}`;

// Make a subscription parser - function(socket, channel, request, callback(true/false))
// This is a very simple one using a switch - if this is unset all subscription requests are accepted
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
    case 'politics':
      callback(true);
      break;
    case 'gossip':
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

const prefs = {
  subscriptionParser: subscriptionParser,
  port: port
};

// Start the scaler
sss.scaler.mongoRedis.connect(mongoConnection, redisConnection, (scalerError, scaler) => {
  if (scalerError) {
    console.log('Error establishing scaler connection');
    return;
  }
  console.log('scaler connection established');
  // Make a server instance
  const server = sss.server(scaler, prefs);
  // Open the sss connection
  server.connect((sssError) => {
    if (sssError) {
      console.log('Error opening super scaled sockets');
      return;
    }
    // onSocket is called when a client connects
    server.onSocket((socket) => {
      // Make a random display name using our functions above
      socket.locals.displayName = makeDisplayName();
      // The server can tell the client stuff tell(topic, msg)
      socket.tell('displayName', socket.locals.displayName);
      // socket.onClose() is called when the connection is closed dont need to unsubscribe to channels, that is automatic
      socket.onClose(() => {
        socket.info.subs.forEach(sub => sub.publish('userLeft', socket.locals.displayName));
      });
      // Called when the client makes an ask request with the topic 'chat' onAsk(topic, callback(msg, reponse))
      socket.onAsk('chat', (msg, response) => {
        if (socket.isSubscribed(msg.room)) {
          msg.displayName = socket.locals.displayName;
          socket.publish(msg.room, 'chat', msg);
          // And respond to the ask request with response.send - response.send(msg)
          response.send(true);
        } else response.send(false);
      });
    });
    console.log(`Super Scaled Sockets connection established and listening on port ${port}`);
    console.log('Chat startup complete');
  });
});
