import { asyncDoAll } from 'jazzy-utility';

const plCodes = {
  SUBSCRIBE: 1,
  UNSUBSCRIBE: 2,
  BEGIN: 3,
  SYNC: 4,
  ASK: 5,
  TELL: 6,
  RESPONSE: 7,
  FEED: 8,
  BOOT: 9,
  BOOTCHANNEL: 10,
  BROADCAST: 11,
  UPDATESUB: 12
};

/** Class Instance that represents an open subscription channel on the server instance
 *  @hideconstructor
 */

class Channel {
  constructor(server, firstSocket, name) {
    this._server = server;
    /**
    * Array of sockets subscribed to the channel.
    */
    this.sockets = [firstSocket];
    /**
    * Locals object where you can assign local data relevant to the channel.
    * @example
    * channel.locals.userId = someUserId;
    */
    this.locals = {};
    /**
    * The channel name.
    */
    this.name = name;
  }

  _subscribe(socket) {
    this.sockets.push(socket);
  }

  _unsubscribe(socket) {
    const _index = this.sockets.findIndex((_socket) => _socket === socket);
    if (_index !== -1) this.sockets.splice(_index, 1);
  }

  /**
  * Callback function that is called after you publish to a channel.
  *
  * @callback publishCallback
  * @param {errorObject} error If there is an error an error object will return, otherwise null.
  * @param {text} uid This will return the uid assigned to the message by the scaler.
  */
  /**
  * Publish a message to all clients subscribed to a channel.
  * @param {text} topic - The topic which the listener will be listening for.
  * @param {any} message - The message to deliver to the clients subscribed to the channel.
  * @param {publishCallback} callback - Returns any error and the uid of the message sent.
  * @example
  * const newsJson = {
  *   title: 'someTitle',
  *   body: 'someInfo'
  * };
  * channel.publish('football', newsJson, (err, uid) => {
  *   newsJson.uid = uid;
  *   someSaveUpdateFunction(newsJson);
  * });
  */

  publish(topic, msg, callback) {
    this._server.publish(this.name, topic, msg, callback);
  }
}

const errors = {
  unknownReqTopic: { name: 'Super Scaled Sockets Error', message: 'Unknown request topic sent from client' }
};

const dummyResponse = {
  send: () => {}
};

/** Class Instance returned when a new client connects to the server
 *  @hideconstructor
 */
class Socket {
  constructor(server, ws, user, session, locals) {
    this._ws = ws;
    this._server = server;
    this._askListeners = {};
    this._tellListeners = {};
    this._onSubscribe = null;
    this._onUnsubscribe = null;
    this._onClose = null;
    /**
    * Locals object where you can assign local data relevant to the socket.
    * @example
    * server.onSocket((socket) => {
    *   socket.locals.userName = getUserName(socket.info.user);
    * });
    */
    this.locals = locals;
    /**
    * Locals object where you can assign local data relevant to the socket.
    * @property {Channel[]} subs Array of channel instances the socket is subscribed to.
    * @property {Boolean} isAlive Is the socket connection alive
    * @property {text} user The user channel Id if one was supplied in session parser.
    * @property {text} session The session channel Id if one was supplied in session parser.
    * @example
    * server.onSocket((socket) => {
    *   socket.locals.userName = getUserName(socket.info.user);
    * });
    */
    this.info = {
      subs: [],
      isAlive: true,
      user: user,
      session: session
    };
    this._ws.info = this.info;
    this._ws.socket = this; // Remove if unneeded
  }

  _send(payload, callback) {
    this._ws.send(JSON.stringify(payload), callback);
  }

  _rawSend(payload, callback) {
    this._ws.send(payload, callback);
  }

  _handleAsk(payload) {
    if (this._askListeners[payload.topic]) {
      const response = {
        send: (msg) => { this._send({ sys: plCodes.RESPONSE, msg, id: payload.id }); }
      };
      this._askListeners[payload.topic](payload.msg, response);
    } else this._send({ sys: plCodes.RESPONSE, err: errors.unknownReqTopic, id: payload.id });
  }

  _handleTell(payload) {
    if (this._tellListeners[payload.topic]) {
      this._tellListeners[payload.topic](payload.msg, dummyResponse);
    }
  }

  _handleSubscribe(payload) {
    if (!/^(?!_)^[a-zA-Z0-9_-]*$/.test(payload.channel)) {
      const response = {
        sys: plCodes.SUBSCRIBE, result: false, channel: payload.channel, id: payload.id
      };
      this._send(response);
      return;
    }
    this._server._prefs.subscriptionParser(this, payload.channel, payload.query, (result) => {
      const response = {
        sys: plCodes.SUBSCRIBE, result, channel: payload.channel, id: payload.id
      };
      if (result) {
        this._server._subscribe(this, payload.channel, (err, uid) => {
          response.lastUid = uid;
          this._send(response);
        });
      } else {
        this._send(response);
      }
    });
  }

  _handleBegin() {
    const prot = {};
    if (this._server._prefs.useHeartbeat) {
      prot.hb = true;
      prot.hbInterval = this._server._prefs.hbInterval;
    }
    if (this.info.user) {
      this._server._scaler.getLastId(this.info.user, (err, id) => {
        this._send({
          sys: plCodes.BEGIN,
          channel: this.info.user,
          lastUid: id,
          prot: prot
        });
      });
    } else {
      this._send({
        sys: plCodes.BEGIN,
        prot: prot
      });
    }
  }

  _handleSync(payload) {
    const response = {
      result: {},
      records: []
    };
    // work around for bug in async do all where an empty array should invoke done but doesn't
    if (payload.subscriptions.length === 0) {
      const _payload = {
        sys: plCodes.SYNC,
        result: response.result,
        records: response.records,
        id: payload.id
      };
      this._send(_payload);
      return;
    }
    const scaler = this._server._scaler;
    asyncDoAll(payload.subscriptions, (sub, i, done) => {
      if (sub.channel === this.info.user) {
        scaler.isSynced(sub.channel, sub.lastUid, (err, res) => {
          if (err) {
            console.log(err);
            response.result[sub.channel] = false;
            done();
            return;
          }
          if (!res) {
            scaler.getSince(sub.channel, sub.lastUid, (_err, _result) => {
              if (_err) console.log(_err);
              response.result[sub.channel] = true;
              response.records.concat(_result);
              done();
            });
          } else {
            response.result[sub.channel] = true;
            done();
          }
        });
      } else {
        this._server._prefs.subscriptionParser(this, sub.channel, sub.query, (result) => {
          if (result) {
            scaler.isSynced(sub.channel, sub.lastUid, (err, res) => {
              if (err) {
                console.log(err);
                response.result[sub.channel] = false;
                done();
                return;
              }
              if (!res) {
                scaler.getSince(sub.channel, sub.lastUid, (_err, _result) => {
                  this._server._subscribe(this, sub.channel);
                  if (_err) console.log(_err);
                  if (_result === null || _result.length === 0) console.log(`Error - empty result from scaler.getSince channel: ${sub.channel}, uid: ${sub.lastUid}`);
                  response.result[sub.channel] = true;
                  response.records = response.records.concat(_result);
                  done();
                });
              } else {
                this._server._subscribe(this, sub.channel);
                response.result[sub.channel] = true;
                done();
              }
            });
          } else {
            response.result[sub.channel] = false;
            done();
          }
        });
      }
    }, () => {
      const _payload = {
        sys: plCodes.SYNC,
        result: response.result,
        records: response.records,
        id: payload.id
      };
      this._send(_payload);
    });
  }

  _register() {
    if (this.info.user) {
      this._server._subscribe(this, this.info.user, () => {
      });
    }
  }

  _unregister() {
    this.info.subs.forEach((sub) => {
      this._server._unsubscribeOnly(this, sub.name);
    });
    this.info.subs = [];
  }

  _handleMessage(e) {
    const payload = JSON.parse(e);
    switch (payload.sys) {
      case plCodes.ASK:
        this._handleAsk(payload);
        break;
      case plCodes.TELL:
        this._handleTell(payload);
        break;
      case plCodes.SUBSCRIBE:
        this._handleSubscribe(payload);
        break;
      case plCodes.UNSUBSCRIBE:
        this._server._unsubscribe(this, payload.channel);
        break;
      case plCodes.BEGIN:
        this._handleBegin();
        break;
      case plCodes.SYNC:
        this._handleSync(payload);
        break;
      default:
      // handle error
        break;
    }
  }

  _start() {
    // Register User and Session channels
    this._register();
    // Call onSocket
    if (this._server._onSocket) this._server._onSocket(this);
    // Set message listener
    this._ws.on('message', (e) => {
      if (e === 'h') {
        this._ws.info.isAlive = true;
        return;
      }
      this._handleMessage(e);
    });
    // Set close listener
    this._ws.on('close', () => {
      if (this._onClose) this._onClose(this);
      this._unregister();
    });
  }

  /**
  * Publish a message to all clients subscribed to a channel. apart from this socket.
  * @param {text} channelName - The channel to publish on.
  * @param {text} topic - The topic which the listener will be listening for.
  * @param {any} message - The message to deliver to the clients subscribed to the channel.
  * @param {publishCallback} callback - Returns any error and the uid of the message sent.
  * @example
  * socket.onTell('channelMsg', (msg) = {
  *   if(socket.isSubscribed(msg.channelName)) {
  *     socket.publish('channelMsg', 'football', msg.msg, (err, uid) => {
  *       msg.uid = uid;
  *       someSaveUpdateFunction(msg);
  *     });
  *   }
  * });
  */

  publish(channelName, topic, msg, callback) {
    this._server._publishWithout(channelName, topic, msg, this._ws, (e, uid) => {
      this._send({ sys: plCodes.UPDATESUB, channel: channelName, uid: uid });
      if (callback) callback(e, uid);
    });
  }

  /**
  * Called to disconnect a client.
  * @param {text} reason - The channel to publish on.
  * @example
  * socket.boot('socket timed out');
  */

  boot(reason) {
    const payload = {
      sys: plCodes.BOOT,
      reason: reason || 'none'
    };
    this._send(payload);
  }

  /**
  * Check whether a client is subscribed to a channel.
  * @param {text} channelName - The channel name to check.
  * @example
  * socket.onTell('channelMsg', (msg) = {
  *   if(socket.isSubscribed(msg.channelName)) {
  *     socket.publish('channelMsg', 'football', msg.msg, (err, uid) => {
  *       msg.uid = uid;
  *       someSaveUpdateFunction(msg);
  *     });
  *   }
  * });
  */

  isSubscribed(channelName) {
    return Boolean(this.info.subs.find((sub) => sub.name === channelName));
  }

  /**
  * Callback function that is called when the socket closes.
  *
  * @callback onCloseCallback
  */
  /**
  * Called when the socket is closed.
  * @param {onCloseCallback} callback - The channel to publish on.
  * @example
  * socket.onClose(() = {
  *   console.log('socket closed:' + socket.info.user);
  * });
  */

  onClose(callback) {
    this._onClose = callback;
  }

  /**
  * Callback function that is called when on ask request comes from the client.
  *
  * @callback onAskCallback
  * @param {any} message - The message from the client.
  * @param {response} response - The response object. Use response.send(<msg>) to respond.
  */
  /**
  * Set the callback listener triggered when the client makes an ask request
  * @param {text} topic - The topic to listen for.
  * @param {onAskCallback} callback - The callback listener.
  * @example
  * // Server
  * socket.onAsk('helloWorld', (msg, response) = {
  *   response.send(msg + ' world'); // Ask requests must always respond!
  * });
  * // Client
  * client.ask('helloWorld', 'hello', (err, response) => {
  *   alert(err ? 'Error' : response);
  * });
  */

  onAsk(topic, callback) {
    this._askListeners[topic] = callback;
  }

  /**
  * Callback function that is called when on tell request comes from the client.
  *
  * @callback onTellCallback
  * @param {any} message - The message from the client.
  */
  /**
  * Set the callback listener triggered when the client makes an ask request
  * @param {text} topic - The topic to listen for.
  * @param {onTellCallback} callback - The callback listener.
  * @example
  * // Server
  * socket.onTell('message', (msg, response) = {
  *   if (socket.isSubscribed(msg.room) {
  *     socket.publish(msg.room, 'message', msg.message);
  *   }
  * });
  * // Client
  * const sendMessage = (chatRoom, message) => {
  * const msg = {room: chatRoom, message: message};
  *   client.tell('message', msg, (err) => {
  *     if(err) alert(err);
  *     else addMessage(msg);
  *   });
  * }
  * // .....
  * subscription.on('message' (msg) => {
  *   addMessage(msg);
  * });
  */

  onTell(topic, callback) {
    this._tellListeners[topic] = callback;
  }

  /**
  * Make a tell call to the client.
  * @param {text} topic - The topic for the tell call.
  * @param {any} message - The callback listener.
  * @example
  * // Server
  * socket.tell('updateToken', aNewToken);
  * // Client
  * client.onTell('updateToken', (msg) => {
  *   someSessionLib.newToken(msg);
  * });
  */

  tell(topic, msg) {
    const payload = {
      sys: plCodes.TELL, topic: topic, msg: msg
    };
    this._send(payload);
  }
}

const cookie = require('cookie');
const WebSocket = require('ws');

const defaults = {
  sessionParser: false,
  subscriptionParser: (s, c, q, _callback) => _callback(true),
  useHeartbeat: false,
  hbInterval: 30000,
  hbThreshold: 2500,
  port: 443,
  safeMode: false, // to be developed
  isSlave: false, // to be developed
};

const applyPrefs = (prefs) => {
  const _prefs = { ...defaults };
  Object.keys(prefs).forEach((key) => {
    if (_prefs[key] !== undefined) _prefs[key] = prefs[key];
    else console.log('SuperScaledSockets', `Unknown preference name '${key}' passed to server class instance`);
  });
  return _prefs;
};

/** Class Instance returned by the server() call in the super-scaled-sockets module
 *  @hideconstructor
 */
class Server {
  constructor(scaler, prefs) {
    /**
    * Locals object where you can assign local data relevant to the server.
    * @example
    * server.onSubscribe((socket, channel) => {
    *   server.locals.lastSubscriptionTime = Date.now();
    * });
    */
    this.locals = {};
    this._scaler = scaler;
    this._prefs = applyPrefs(prefs);
    this._wss = null;
    this._onSocket = null;
    this._onChannelOpen = null;
    this._onChannelClose = null;
    this._channels = {};
    this._onSubscribe = null;
    this._onUnsubscribe = null;
  }

  _subscribe(socket, channelName, _callback) {
    if (!this._channels[channelName]) {
      const channel = new Channel(this, socket, channelName);
      this._channels[channelName] = channel;
      socket.info.subs.push(channel);
      this._scaler.subscribe(channelName);
      if (_callback) { // Get  uid before calling listeners so new uids are not included for syncing
        this._scaler.getLastId(channelName, (err, uid) => {
          if (this._onChannelOpen) this._onChannelOpen(channel);
          if (this._onSubscribe) this._onSubscribe(socket, channel);
          _callback(err, uid, channel);
        });
        return;
      }
      if (this._onChannelOpen) this._onChannelOpen(channel);
      if (this._onSubscribe) this._onSubscribe(socket, channel);
    } else {
      this._channels[channelName].sockets.push(socket);
      socket.info.subs.push(this._channels[channelName]);
      if (this._onSubscribe) this._onSubscribe(socket, this._channels[channelName]);
      if (_callback) {
        this._scaler.getLastId(channelName, (err, result) => {
          _callback(err, result, this._channels[channelName]);
        });
      }
    }
  }

  _unsubscribeOnly(socket, channelName) {
    if (this._channels[channelName]) {
      if (this._onUnsubscribe) this._onUnsubscribe(socket, this._channels[channelName]);
      if (this._channels[channelName].sockets.length > 1) {
        const _index = this._channels[channelName].sockets.findIndex((_socket) => _socket === socket);
        if (_index !== -1) this._channels[channelName].sockets.splice(_index, 1);
      } else {
        if (this._onChannelClose) this._onChannelClose(this._channels[channelName]);
        delete this._channels[channelName];
        this._scaler.unsubscribe(channelName);
      }
    }
  }

  _unsubscribe(socket, channelName) {
    this._unsubscribeOnly(socket, channelName);
    if (socket.info.subs.length > 1) {
      const _index = socket.info.subs.findIndex((channel) => channel.name === channelName);
      if (_index !== -1) socket.info.subs.splice(_index, 1);
    } else {
      socket.info.subs.length = 0;
    }
  }

  _publishWithout(channelName, topic, msg, ws, callback) {
    const payload = {
      sys: plCodes.FEED,
      topic: topic,
      msg: msg,
      channel: channelName
    };
    this._scaler.publish(channelName, payload, (error, uid) => {
      if (error) {
        callback(error, null);
        return;
      }
      payload.uid = uid;
      const jsonPl = JSON.stringify(payload);
      if (this._channels[channelName]) {
        this._channels[channelName].sockets.forEach((socket) => {
          if (socket._ws !== ws) {
            socket._rawSend(jsonPl);
          }
        });
      }
      if (callback) callback(null, uid);
    });
  }

  _broadcastSend(payload) {
    const data = JSON.stringify(payload);
    this._wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client._rawSend(data);
      }
    });
  }

  /**
  * Callback function that is called after a connection has been established.
  *
  * @callback connectCallback
  * @param {errorObject} error If there is an error an error object will return, otherwise null.
  */
  /**
  * Connect to the server.
  * @param {connectCallback} callback - Callbacks with an error if unable to connect.
  * @example
  * server.connect((err) => {
  *   if (err) {
  *     // handle the error
  *     return;
  *   }
  *   // ........
  */

  connect(callback) {
    const verifyClient = (info, done) => {
      info.req.cookies = info.req.headers.cookie ? cookie.parse(info.req.headers.cookie) : {};
      this._prefs.sessionParser(info.req, (result, user, session, locals) => {
        info.req._user = user;
        info.req._session = session;
        info.req._locals = locals || {};
        done(result, 403, 'connection refused');
      });
    };

    const wssPrefs = {
      verifyClient: this._prefs.sessionParser ? verifyClient : false,
      port: this._prefs.port
    };

    this._wss = new WebSocket.Server(wssPrefs, (error) => {
      if (error) {
        callback(error);
      } else {
        this._scaler.subscribe('_bc_');
        this._scaler.onMessage((channelName, getData) => {
          if (channelName === '_bc_') {
            getData((err, payload) => {
              if (!err) {
                this._broadcastSend(payload);
              } else console.log(err);
            });
            return;
          }
          if (this._channels[channelName]) {
            getData((err, payload) => {
              if (!err) {
                const jsonPl = JSON.stringify(payload);
                this._channels[channelName].sockets.forEach((socket) => {
                  socket._rawSend(jsonPl);
                });
              } else console.log(err);
            });
          }
        });
        callback(null);
        this._wss.on('connection', (ws, req) => {
          // Make Socket instance
          new Socket(this, ws, req._user, req._session, req._locals)._start();
        });
        if (this._prefs.useHeartbeat) {
          setInterval(() => {
            this._wss.clients.forEach((ws) => {
              if (ws.info.isAlive === false) {
                ws.terminate();
                return;
              }
              ws.info.isAlive = false;
              ws.socket._rawSend('h');
            });
          }, this._prefs.hbInterval);
        }
      }
    });
  }

  /**
  * Callback function that is called after a connection request is made to the server.
  *
  * @callback onSocketCallback
  * @param {Socket} socket Returns a socket instance representing the connected client.
  */
  /**
  * Set a listener for when a client connects to the server.
  * @param {onSocketCallback} callback - Returns a socket instance representing the connected client.
  * @example
  * client.onSocket((socket) => {
  *   socket.onAsk((msg, response) => {
  *     //...
  */

  onSocket(callback) {
    this._onSocket = callback;
  }


  /* Future dev
  onPublish(callback) {
    this._onPublish = callback;
  }
  */

  /**
  *Broadcast a message to all clients connected to all server instances.
  * @param {text} topic - The topic which the listener will be listening for.
  * @param {any} message - The message to deliver to the client.
  * @example
  * server.broadcast('time', Date.now());
  */

  broadcast(topic, msg) {
    const payload = {
      sys: plCodes.BROADCAST, topic, msg
    };
    this._scaler.publish('_bc_', payload, () => {
      this._broadcastSend(payload);
    });
  }

  bootAll(channelName, reason) {
    const payload = {
      sys: plCodes.BOOT,
      reason: reason || 'none'
    };
    this._scaler.publish(channelName, payload, () => {
      if (this._channels[channelName]) {
        const jsonPl = JSON.stringify(payload);
        this._channels[channelName].sockets.forEach((socket) => {
          socket._rawSend(jsonPl);
        });
      }
    });
  }

  /**
  * Callback function that is called after you publish to a channel.
  *
  * @callback publishCallback
  * @param {errorObject} error If there is an error an error object will return, otherwise null.
  * @param {text} uid This will return the uid assigned to the message by the scaler.
  */
  /**
  * Publish a message to all clients subscribed to a channel.
  * @param {text} channelName - The channel to publish on.
  * @param {text} topic - The topic which the listener will be listening for.
  * @param {any} message - The message to deliver to the clients subscribed to the channel.
  * @param {publishCallback} callback - Returns any error and the uid of the message sent.
  * @example
  * const newsJson = {
  *   title: 'someTitle',
  *   body: 'someInfo'
  * };
  * server.publish('sports', 'football', newsJson, (err, uid) => {
  *   newsJson.uid = uid;
  *   someSaveUpdateFunction(newsJson);
  * })
  */

  publish(channelName, topic, msg, callback) {
    const payload = {
      sys: plCodes.FEED, topic, msg, channel: channelName
    };
    this._scaler.publish(channelName, payload, (error, uid) => {
      if (error) {
        callback(error, null);
        return;
      }
      payload.uid = uid;
      if (this._channels[channelName]) {
        const jsonPl = JSON.stringify(payload);
        this._channels[channelName].sockets.forEach((socket) => {
          socket._rawSend(jsonPl);
        });
      }
      if (callback) callback(null, uid);
    });
  }

  publishToMany(channelNames, topic, msg) {
    channelNames.forEach((channelName) => {
      this.publish(channelName, topic, msg);
    });
  }

  /**
  * Callback function that is called when a channel is opening on the server instance.
  *
  * @callback onChannelOpenCallback
  * @param {Channel} channel Returns a channel instance representing a channel opening on the server instance.
  */
  /**
  * Set a listener for when a channel is opening on the server instance.
  * @param {onChannelOpenCallback} callback - Returns a socket instance representing the opening channel.
  * @example
  * client.onChannelOpen((channel) => {
  *   channel.locals.info = someGetChannelInfoFunction(channel.name);
  * });
  */

  onChannelOpen(callback) {
    this._onChannelOpen = callback;
  }

  /**
  * Callback function that is called when a channel is closing on the server instance.
  *
  * @callback onChannelCloseCallback
  * @param {Channel} channel Returns a channel instance representing a channel closing on the server instance.
  */
  /**
  * Set a listener for when a channel is close on the server instance.
  * @param {onChannelCloseCallback} callback - Returns a socket instance representing the closing channel.
  * @example
  * client.onChannelClose((channel) => {
  *   console.log(`channel: ${channel.name} has closed.`);
  * });
  */

  onChannelClose(callback) {
    this._onChannelClose = callback;
  }

  /**
  * Callback function that is called when a client subscribes to a channel.
  *
  * @callback onSubscribeCallback
  * @param {Socket} socket Returns a socket instance representing the channel that has subscribed to the channel.
  * @param {Channel} channel Returns a channel instance representing the channel that is being subscribed to.
  */
  /**
  * Set a listener for when a channel is subscribed to.
  * @param {onSubscribeCallback} callback - Returns a socket instance and channel instance.
  * @example
  * client.onSubscribe((socket, channel) => {
  *   channel.locals.userNames.push(socket.locals.userName);
  * });
  */

  onSubscribe(callback) {
    this._onSubscribe = callback;
  }

  /**
  * Callback function that is called when a client unsubscribes from a channel.
  *
  * @callback onUnsubscribeCallback
  * @param {Socket} socket Returns a socket instance representing the channel that has unsubscribed from the channel.
  * @param {Channel} channel Returns a channel instance representing the channel that is being unsubscribed from.
  */
  /**
  * Set a listener for when a channel is unsubscribed from.
  * @param {onUnsubscribeCallback} callback - Returns a socket instance and channel instance.
  * @example
  * client.onSubscribe((socket, channel) => {
  *   channel.locals.userNames.push(socket.locals.userName);
  * });
  */

  onUnsubscribe(callback) {
    this._onUnsubscribe = callback;
  }

  /**
  *Closes the server instance
  * @param {text} reason - The text reason you are closing the server. This is passed to the clients.
  * @example
  * server.close('rescaling');
  */

  close(reason, update) {
    // needs improving
    this._broadcastSend({ sys: plCodes.CLOSE, reason: reason || 'none', update: update || { reconnect: true, wait: 5000 } });
    this._connection.close();
    this._scaler.close();
  }
}

function publisher (scaler, callback) {
  const obj = {
    _scaler: scaler,
    publish: function publish(channelName, topic, msg, _callback) {
      const payload = {
        sys: plCodes.FEED, topic, msg, channel: channelName
      };
      this._scaler.publish(channelName, payload, (err, uid) => {
        if (_callback) _callback(err, uid);
      });
    },
    broadcast: function broadcast(topic, msg, _callback) {
      const payload = {
        sys: plCodes.BROADCAST, topic, msg,
      };
      this._scaler.publish('_bc_', payload, (err, uid) => {
        if (_callback) _callback(err, uid);
      });
    },
    bootAll: function bootAll(channelName, reason, _callback) {
      const payload = {
        sys: plCodes.BOOT,
        reason: reason || 'none'
      };
      this._scaler.publish(channelName, payload, (err, uid) => {
        if (_callback) _callback(err, uid);
      });
    }
  };
  if (callback) callback(obj);
  return obj;
}

/** Root module for the library called with import/require sss from 'super-scaled-sockets-client'
 * @example
 * // ES6 with Bundler
 * import sss from 'super-scaled-sockets';
 * // CJS
 * const sss = require('super-scaled-sockets');
 * @module super-scaled-sockets  */

/**
* Function that is used to authorized a clients connection to the server.<br/>
* Authorization is complete by calling done() with a boolean result as the first argument. The 2nd argument is a userId to open a user subscription. The third is sessionId to open a session subscription and the fourth is a locals object to be passed to the Socket class locals.
* @callback sessionParser
* @global
* @param {object} request The http request from the client.
* @param {function} done The function to call once authorization is complete. This must be called.
* @example
* const sessionParser = (request, done) => {
*   const token = request.cookies.token;
*   mongoSessions.validateToken(token, (__err, result) => {
*   const locals = {
*     userName: result.userName,
*     firstName: result.firstName
*   };
*     done(result.isLogged, result.userId, result.sessionId, locals);
*   });
* }
* const options = {
*   sessionParser, port
* };
* const server = sss.server(scaler, options);
* server.connect((err) => {
*   // .....
*/

/**
* Function that is used to authorized a clients subscription to a channel.<br/>
* Call done(true/false) to authorize or reject the request.
* @callback subscriptionParser
* @global
* @param {Socket} socket Socket instance representing the channel that has subscribed to the channel.
* @param {text} channel The name of the channel the client is trying to subscribe to.
* @param {any} request The request in the clients subscription request.
* @param {function} done The function to call once authorization is complete. . This must be called.
* @example
* // password for the private room
* const privateRoomPw = '21sdf24dgFD1fd2df2';
* // The subscription Parser function
* const subscriptionParser = (socket, channelName, request, done) => {
*   if (channelName === 'private') {
*     done(privateRoomPw === request);
*     return;
*   }
*   // returns false if the room ket is unknown
*   done(roomKeys.includes(channelName));
* };
*/

/** Function called to create a server instance
* @function
* @static
* @param {scaler} scaler - The scaler object
* @param {object} options - An options object
* @param {sessionParser} [options.sessionParser="All Requests Accepted"] - Function that is used to authorized a clients connection to the server.
* @param {subscriptionParser} [options.subscriptionParser="All Requests Accepted"] -Function that is used to authorized a clients subscription to a channel.
* @param {boolean} [options.useHeartbeat=30000] - Whether to use a heartbeat to keep an accurate account of whether users have disconnected.
* @param {number} [options.hbInterval=30000] - The interval at which each client should be sent a heartbeat.
* @param {number} [options.hbThreshold=2500] - The threshold allowed for client-server latency.
* @param {number} [options.port=443] - The port the instance should listen for connections on.
* @return {Server} - A server instance
* @example
* const options = {
*  useHeartbeat: true
* }
* const server = server(scaler, options);
* server.connect( (error) => {
*   // .........
*/
const server = (_scaler, options) => new Server(_scaler, options);

var index = {
  server,
  publisher
};

export default index;
export { publisher, server };
