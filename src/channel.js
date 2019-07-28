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
    const _index = this.sockets.findIndex(_socket => _socket === socket);
    if (_index !== -1) this.sockets.splice(_index, 1);
  }

  publish(topic, msg) {
    this._server._publish(this.name, topic, msg);
  }
}

module.exports = Channel;
