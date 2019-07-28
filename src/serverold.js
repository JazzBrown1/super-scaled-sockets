
const cookie = require('cookie');
const WebSocket = require('ws');

const plCodes = require('./plCodes');
const Channel = require('./channel');
const Socket = require('./socket');

const sssUtil = require('./sssUtil');

const errors = {
  unknownReqTopic: { name: 'Super Scaled Sockets Error', message: 'Unknown request topic sent from client' }
};

const dummyResponse = {
  send: () => {}
};

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
  const _prefs = Object.assign({}, defaults);
  Object.keys(prefs).forEach((key) => {
    if (_prefs[key] !== undefined) _prefs[key] = prefs[key];
    else console.log('SuperScaledSockets', `Unknown preference name '${key}' passed to server class instance`);
  });
  return _prefs;
};

module.exports = (scaler, prefs, callback__) => {
  const obj = {
    _scaler: scaler,
    _prefs: applyPrefs(prefs),
    _wss: null,
    _onSocket: null,
    _onChannelOpen: null,
    _onChannelClose: null,
    _channels: {},
    _onSubscribe: null,
    _onUnsubscribe: null,
    _subscribe: function _subscribe(socket, channelName, _callback) {
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
    },
    _unsubscribe: function _unsubscribe(socket, channelName) {
      if (this._channels[channelName]) {
        if (this._onUnsubscribe) this._onUnsubscribe(socket, this._channels[channelName]);
        if (this._channels[channelName].sockets.length > 1) {
          const _index = this._channels[channelName].sockets.findIndex(_socket => _socket === socket);
          if (_index !== -1) this._channels[channelName].sockets.splice(_index, 1);
        } else {
          if (this._onChannelClose) this._onChannelClose(this._channels[channelName]);
          delete this._channels[channelName];
          this._scaler.unsubscribe(channelName);
        }
      }
      if (socket.info.subs.length > 1) {
        const _index = socket.info.subs.findIndex(channel => channel.name === channelName);
        if (_index !== -1) socket.info.subs.splice(_index, 1);
      } else {
        socket.info.subs.length = 0;
      }
    },
    _addSocket: function _addSocket(socket, user, _callback) {
      const info = {
        subs: [],
        isAlive: true
      };
      socket._ws.info = info;
      socket.info = info;
      if (user) {
        socket.info.user = user;
        this._subscribe(socket, user, (err, lastUid) => {
          if (_callback) _callback(err, lastUid);
        });
      } else if (_callback) _callback(null);
    },
    _removeSocket: function _removeSocket(socket) {
      socket.info.subs.forEach((sub) => {
        if (this._onUnsubscribe) this._onUnsubscribe(socket, this._channels[sub.name]);
        if (this._channels[sub.name]) {
          if (this._channels[sub.name].sockets.length > 1) {
            const _index = this._channels[sub.name].sockets.findIndex(_socket => socket === _socket);
            if (_index !== -1) this._channels[sub.name].sockets.splice(_index, 1);
            else console.log('ERROR unable to find sub in channel object');
          } else {
            if (this._onChannelClose) this._onChannelClose(this._channels[sub.name]);
            delete this._channels[sub.name];
            this._scaler.unsubscribe(sub.name);
          }
        }
      });
    },
    _publishWithout: function _publishWithout(channelName, topic, msg, ws) {
      const payload = {
        sys: plCodes.FEED,
        topic: topic,
        msg: msg,
        channel: channelName
      };
      this._scaler.publish(channelName, payload, (error, uid) => {
        payload.uid = uid;
        const jsonPl = JSON.stringify(payload);
        if (this._channels[channelName]) {
          this._channels[channelName].sockets.forEach((socket) => {
            if (socket._ws !== ws) {
              socket._rawSend(jsonPl);
            }
          });
        }
      });
    },
    _broadcastSend: function _broadcastSend(payload) {
      const data = JSON.stringify(payload);
      this._wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client._rawSend(data);
        }
      });
    },
    connect: function connect(callback) {
      const verifyClient = (info, done) => {
        info.req.cookies = cookie.parse(info.req.headers.cookie);
        this._prefs.sessionParser(info.req, (result, user) => {
          info.req._user = user;
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
            // Make Socket instace
            const socket = new Socket(this, ws);
            this._addSocket(socket, req._user);
            if (this._onSocket) {
              this._onSocket(socket);
            }
            ws.on('message', (e) => {
              if (e === 'h') {
                ws.info.isAlive = true;
                return;
              }
              const payload = JSON.parse(e);
              switch (payload.sys) {
                case plCodes.ASK:
                  if (socket._askListeners[payload.topic]) {
                    const response = {
                      send: (msg) => { socket._send({ sys: plCodes.RESPONSE, msg, id: payload.id }); }
                    };
                    socket._askListeners[payload.topic](payload.msg, response);
                  } else socket._send({ sys: plCodes.RESPONSE, err: errors.unknownReqTopic, id: payload.id });
                  break;
                case plCodes.TELL:
                  if (socket._tellListeners[payload.topic]) {
                    socket._tellListeners[payload.topic](payload.msg, dummyResponse);
                  }
                  break;
                case plCodes.SUBSCRIBE:
                  if (!/^(?!_)^[a-zA-Z0-9_-]*$/.test(payload.channel)) {
                    const response = {
                      sys: plCodes.SUBSCRIBE, result: false, channel: payload.channel, id: payload.id
                    };
                    socket._send(response);
                    return;
                  }
                  this._prefs.subscriptionParser(socket, payload.channel, payload.query, (result) => {
                    const response = {
                      sys: plCodes.SUBSCRIBE, result, channel: payload.channel, id: payload.id
                    };
                    if (result) {
                      this._subscribe(socket, payload.channel, (err, uid) => {
                        response.lastUid = uid;
                        socket._send(response);
                      });
                    } else {
                      socket._send(response);
                    }
                  });
                  break;
                case plCodes.UNSUBSCRIBE:
                  this._unsubscribe(socket, payload.channel);
                  break;
                case plCodes.BEGIN: {
                  const prot = {};
                  if (this._prefs.useHeartbeat) {
                    prot.hb = true;
                    prot.hbInterval = this._prefs.hbInterval;
                  }
                  if (socket.info.user) {
                    this._scaler.getLastId(socket.info.user, (err, id) => {
                      socket._send({
                        sys: plCodes.BEGIN,
                        channel: socket.info.user,
                        lastUid: id,
                        prot: prot
                      });
                    });
                  } else {
                    socket._send({
                      sys: plCodes.BEGIN,
                      prot: prot
                    });
                  }
                  break; }
                case plCodes.SYNC: {
                  const response = {
                    result: {},
                    records: []
                  };
                  sssUtil.asyncDoAll(payload.subscriptions, (sub, i, done) => {
                    if (sub.channel === socket.info.user) {
                      this._scaler.isSynced(sub.channel, sub.lastUid, (err, res) => {
                        if (err) {
                          console.log(err);
                          response.result[sub.channel] = false;
                          done();
                          return;
                        }
                        if (!res) {
                          this._scaler.getSince(sub.channel, sub.lastUid, (_err, _result) => {
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
                      this._prefs.subscriptionParser(socket, sub.channel, sub.query, (result) => {
                        if (result) {
                          this._subscribe(socket, sub.channel);
                          this._scaler.isSynced(sub.channel, sub.lastUid, (err, res) => {
                            if (err) {
                              console.log(err);
                              response.result[sub.channel] = false;
                              done();
                              return;
                            }
                            if (!res) {
                              this._scaler.getSince(sub.channel, sub.lastUid, (_err, _result) => {
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
                    socket._send(_payload);
                  });
                } break;
                default:
                // handle error
                  break;
              }
            });
            ws.on('close', () => {
              if (socket._onClose) socket._onClose(socket);
              this._removeSocket(socket);
            });
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
    },
    locals: {},
    onSocket: function onSocket(callback) {
      this._onSocket = callback;
    },
    onPublish: function onPublish(callback) {
      this._onPublish = callback;
    },
    broadcast: function broadcast(topic, msg) {
      const payload = {
        sys: plCodes.BROADCAST, topic, msg
      };
      this._scaler.publish('_bc_', payload, () => {
        this._broadcastSend(payload);
      });
    },
    bootAll: function bootAll(channelName, reason) {
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
    },
    publish: function publish(channelName, topic, msg) {
      const payload = {
        sys: plCodes.FEED, topic, msg, channel: channelName
      };
      this._scaler.publish(channelName, payload, (error, uid) => {
        payload.uid = uid;
        if (this._channels[channelName]) {
          const jsonPl = JSON.stringify(payload);
          this._channels[channelName].sockets.forEach((socket) => {
            socket._rawSend(jsonPl);
          });
        }
      });
    },
    publishToMany: function publishToMany(channelNames, topic, msg) {
      channelNames.forEach((channelName) => {
        this.publish(channelName, topic, msg);
      });
    },
    onChannelOpen: function onChannelOpen(callback) {
      this._onChannelOpen = callback;
    },
    onChannelClose: function onChannelClose(callback) {
      this._onChannelClose = callback;
    },
    onSubscribe: function onSubscribe(callback) {
      this._onSubscribe = callback;
    },
    onUnsubscribe: function onSubscribe(callback) {
      this._onUnsubscribe = callback;
    },
    close: function close(reason, update) {
      this._broadcastSend({ sys: plCodes.CLOSE, reason: reason || 'none', update: update || { reconnect: true, wait: 5000 } });
      this._connection.close();
      this._scaler.close();
    }
  };
  if (callback__) callback__(obj);
  return obj;
};
