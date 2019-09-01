/** Class Instance that represents an open subscription channel on the server instance
 *  @hideconstructor
 */

class Channel {
  constructor(server, firstSocket, name) {
    this._server = server;
    /**
    * Array of sockets subscribed to the channel.
    */
    this.sockets = [firstSocket];
    /**
    * Locals object where you can assign local data relevant to the channel.
    * @example
    * channel.locals.userId = someUserId;
    */
    this.locals = {};
    /**
    * The channel name.
    */
    this.name = name;
  }

  _subscribe(socket) {
    this.sockets.push(socket);
  }

  _unsubscribe(socket) {
    const _index = this.sockets.findIndex((_socket) => _socket === socket);
    if (_index !== -1) this.sockets.splice(_index, 1);
  }

  /**
  * Callback function that is called after you publish to a channel.
  *
  * @callback publishCallback
  * @param {errorObject} error If there is an error an error object will return, otherwise null.
  * @param {text} uid This will return the uid assigned to the message by the scaler.
  */
  /**
  * Publish a message to all clients subscribed to a channel.
  * @param {text} topic - The topic which the listener will be listening for.
  * @param {any} message - The message to deliver to the clients subscribed to the channel.
  * @param {publishCallback} callback - Returns any error and the uid of the message sent.
  * @example
  * const newsJson = {
  *   title: 'someTitle',
  *   body: 'someInfo'
  * };
  * channel.publish('football', newsJson, (err, uid) => {
  *   newsJson.uid = uid;
  *   someSaveUpdateFunction(newsJson);
  * });
  */

  publish(topic, msg, callback) {
    this._server.publish(this.name, topic, msg, callback);
  }
}

export default Channel;
