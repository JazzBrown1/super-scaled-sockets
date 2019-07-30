const mongoRedis = require('../scalers/mongoRedis');
const Server = require('./server');
const publisher = require('./publisher');

/** Root module for the library called with import sssc from 'super-scaled-sockets-client'
 * @example
 * const sss = include('super-scaled-sockets');
 * @module super-scaled-sockets */

module.exports = {
  scaler: {
    mongoRedis: mongoRedis
  },
  /** Function called to create a server instance
  * @function
  * @param {scaler} scaler - The scaler object
  * @param {object} options - An options object
  * @param {boolean} [options.param1=false] - Param 1.
  * @param {number} [options.param2=true] - Param 2.
  * @return {Server}
  * @example
  * const sss = include('super-scaled-sockets');
  * // .........
  */
  server: (scaler, prefs) => new Server(scaler, prefs),
  publisher: publisher
};
