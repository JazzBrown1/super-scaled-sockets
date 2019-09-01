import { asyncDoAll } from 'jazzy-utility';
import plCodes from './plCodes';

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

export default Socket;
