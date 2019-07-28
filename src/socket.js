const plCodes = require('./plCodes');

class Socket {
  constructor(server, ws) {
    this._ws = ws;
    this._server = server;
    this._askListeners = {};
    this._tellListeners = {};
    this._onSubscribe = null;
    this._onUnsubscribe = null;
    this._onClose = null;
    this.info = ws.info;
    this.locals = {};
    ws.socket = this;
  }

  _send(payload, callback) {
    this._ws.send(JSON.stringify(payload), callback);
  }

  _rawSend(payload, callback) {
    this._ws.send(payload, callback);
  }

  publish(channelName, topic, msg) {
    this._server._publishWithout(channelName, topic, msg, this._ws);
  }

  boot(reason) {
    const payload = {
      sys: plCodes.BOOT,
      reason: reason || 'none'
    };
    this._send(payload);
  }

  isSubscribed(channelName) {
    return Boolean(this.info.subs.find(sub => sub.name === channelName));
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


module.exports = Socket;
