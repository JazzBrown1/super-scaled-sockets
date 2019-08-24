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

export default Channel;
