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

export default Socket;
