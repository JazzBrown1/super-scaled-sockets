module.exports = (server, firstSocket, name) => ({
  _subscribe: function _subscribe(socket) {
    this.sockets.push(socket);
  },
  _unsubscribe: function _unsubscribe(socket) {
    const _index = this.sockets.findIndex(_socket => _socket === socket);
    if (_index !== -1) this.sockets.splice(_index, 1);
  },
  sockets: [firstSocket],
  locals: {},
  name: name,
  publish: function _publish(topic, msg) {
    server._publish(this.name, topic, msg);
  }
});
