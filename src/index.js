import Server from './server';
import publisher from './publisher';

/** Root module for the library called with import/require sss from 'super-scaled-sockets-client'
 * @example
 * // ES6 with Bundler
 * import sss from 'super-scaled-sockets';
 * // CJS
 * const sss = require('super-scaled-sockets');
 * @module super-scaled-sockets  */

/**
* Function that is used to authorized a clients connection to the server.<br/>
* Authorization is complete by calling done() with a boolean result as the first argument. The 2nd argument is a userId to open a user subscription. The third is sessionId to open a session subscription and the fourth is a locals object to be passed to the Socket class locals.
* @callback sessionParser
* @global
* @param {object} request The http request from the client.
* @param {function} done The function to call once authorization is complete. This must be called.
* @example
* const sessionParser = (request, done) => {
*   const token = request.cookies.token;
*   mongoSessions.validateToken(token, (__err, result) => {
*   const locals = {
*     userName: result.userName,
*     firstName: result.firstName
*   };
*     done(result.isLogged, result.userId, result.sessionId, locals);
*   });
* }
* const options = {
*   sessionParser, port
* };
* const server = sss.server(scaler, options);
* server.connect((err) => {
*   // .....
*/

/**
* Function that is used to authorized a clients subscription to a channel.<br/>
* Call done(true/false) to authorize or reject the request.
* @callback subscriptionParser
* @global
* @param {Socket} socket Socket instance representing the channel that has subscribed to the channel.
* @param {text} channel The name of the channel the client is trying to subscribe to.
* @param {any} request The request in the clients subscription request.
* @param {function} done The function to call once authorization is complete. . This must be called.
* @example
* // password for the private room
* const privateRoomPw = '21sdf24dgFD1fd2df2';
* // The subscription Parser function
* const subscriptionParser = (socket, channelName, request, done) => {
*   if (channelName === 'private') {
*     done(privateRoomPw === request);
*     return;
*   }
*   // returns false if the room ket is unknown
*   done(roomKeys.includes(channelName));
* };
*/

/** Function called to create a server instance
* @function
* @static
* @param {scaler} scaler - The scaler object
* @param {object} options - An options object
* @param {sessionParser} [options.sessionParser="All Requests Accepted"] - Function that is used to authorized a clients connection to the server.
* @param {subscriptionParser} [options.subscriptionParser="All Requests Accepted"] -Function that is used to authorized a clients subscription to a channel.
* @param {boolean} [options.useHeartbeat=30000] - Whether to use a heartbeat to keep an accurate account of whether users have disconnected.
* @param {number} [options.hbInterval=30000] - The interval at which each client should be sent a heartbeat.
* @param {number} [options.hbThreshold=2500] - The threshold allowed for client-server latency.
* @param {number} [options.port=443] - The port the instance should listen for connections on.
* @return {Server} - A server instance
* @example
* const options = {
*  useHeartbeat: true
* }
* const server = server(scaler, options);
* server.connect( (error) => {
*   // .........
*/
const server = (_scaler, options) => new Server(_scaler, options);

export { server, publisher };

export default {
  server,
  publisher
};
