const plCodes = require('./plCodes');

module.exports = (server, ws) => ({
  _ws: ws,
  _askListeners: {},
  _tellListeners: {},
  _onSubscribe: null,
  _onUnsubscribe: null,
  _onClose: null,
  _send: function _send(payload, callback) {
    ws.send(JSON.stringify(payload), callback);
  },
  info: ws.info,
  locals: {},
  publish: function _publish(channelName, topic, msg) {
    server._publishWithout(channelName, topic, msg, ws);
  },
  isSubscribed: function isSubscribed(channelName) {
    return Boolean(this.info.subs.find(sub => sub.name === channelName));
  },
  onSubscribe: function onSubscribe(callback) {
    this._onSubscribe = callback;
  },
  onUnsubscribe: function onSubscribe(callback) {
    this._onUnsubscribe = callback;
  },
  on: function on(topic, callback) {
    // to be deprecated
    console.log('socket.on is to be deprecated use socket.onAsk or socket.onTell instead');
    this._tellListeners[topic] = callback;
    this._askListeners[topic] = callback;
  },
  onClose: function onClose(callback) {
    this._onClose = callback;
  },
  onAsk: function onAsk(topic, callback) {
    this._askListeners[topic] = callback;
  },
  onTell: function onTell(topic, callback) {
    this._tellListeners[topic] = callback;
  },
  tell: function tell(topic, msg) {
    const payload = {
      sys: plCodes.TELL, topic: topic, msg: msg
    };
    this._send(payload);
  }
});
