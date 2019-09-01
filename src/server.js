
import plCodes from './plCodes';
import Channel from './channel';
import Socket from './socket';

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

export default Server;
