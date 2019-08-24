
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

export default Server;
