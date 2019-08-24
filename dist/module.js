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
  BROADCAST: 11
};

/** Class Instance that represents an open subscription channel on the server instance
 *  @hideconstructor
 */

class Channel {
  constructor(server, firstSocket, name) {
    this._server = server;
    this.sockets = [firstSocket];
    this.locals = {};
    this.name = name;
  }

  _subscribe(socket) {
    this.sockets.push(socket);
  }

  _unsubscribe(socket) {
    const _index = this.sockets.findIndex((_socket) => _socket === socket);
    if (_index !== -1) this.sockets.splice(_index, 1);
  }

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
    this.info = ws.info;
    this.locals = locals;
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
            this._server._subscribe(this, sub.channel);
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
                  done();
                });
              } else {
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

  publish(channelName, topic, msg, callback) {
    this._server._publishWithout(channelName, topic, msg, this._ws, callback);
  }

  boot(reason) {
    const payload = {
      sys: plCodes.BOOT,
      reason: reason || 'none'
    };
    this._send(payload);
  }

  isSubscribed(channelName) {
    return Boolean(this.info.subs.find((sub) => sub.name === channelName));
  }

  onClose(callback) {
    this._onClose = callback;
  }

  onAsk(topic, callback) {
    this._askListeners[topic] = callback;
  }

  onTell(topic, callback) {
    this._tellListeners[topic] = callback;
  }

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
  safeMofe: false, // to be deved
  isSlave: false, // to be deved
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
 * @memberof super-scaled-sockets
 */
class Server {
  constructor(scaler, prefs) {
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
      if (this._onChannelOpen) this._onChannelOpen(channel);
      if (this._onSubscribe) this._onSubscribe(socket, channel);
      if (_callback) {
        this._scaler.getLastId(channelName, (err, uid) => {
          _callback(err, uid, channel);
        });
      }
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

  onSocket(callback) {
    this._onSocket = callback;
  }

  onPublish(callback) {
    this._onPublish = callback;
  }

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

  onChannelOpen(callback) {
    this._onChannelOpen = callback;
  }

  onChannelClose(callback) {
    this._onChannelClose = callback;
  }

  onSubscribe(callback) {
    this._onSubscribe = callback;
  }

  onUnsubscribe(callback) {
    this._onUnsubscribe = callback;
  }

  close(reason, update) {
    this._broadcastSend({ sys: plCodes.CLOSE, reason: reason || 'none', update: update || { reconnect: true, wait: 5000 } });
    this._connection.close();
    this._scaler.close();
  }
}

function publisher (scaler, callback) {
  const obj = {
    _scaler: scaler,
    publish: (channelName, topic, msg, _callback) => {
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

/** Function called to create a server instance
* @function
* @param {scaler} scaler - The scaler object
* @param {object} options - An options object
* @param {boolean} [options.param1=false] - Param 1.
* @param {number} [options.param2=true] - Param 2.
* @return {Server} - A server instance
* @example
* const sss = require('super-scaled-sockets');
* // .........
*/
const server = (_scaler, prefs) => new Server(_scaler, prefs);

var index = {
  server,
  publisher
};

export default index;
export { publisher, server };
