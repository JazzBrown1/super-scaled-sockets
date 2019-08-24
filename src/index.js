import Server from './server';
import publisher from './publisher';

/** Root module for the library called with import sssc from 'super-scaled-sockets-client'
 * @example
 * const sss = require('super-scaled-sockets');
 * @module super-scaled-sockets */

const scaler = {
  mongoRedis: mongoRedis
};

/** Function called to create a server instance
* @function
* @param {scaler} scaler - The scaler object
* @param {object} options - An options object
* @param {boolean} [options.param1=false] - Param 1.
* @param {number} [options.param2=true] - Param 2.
* @return {Server} - A server instance
* @example
* const sss = require('super-scaled-sockets');
* // .........
*/
const server = (_scaler, prefs) => new Server(_scaler, prefs);

export {
  /** Function called to create a server instance
* @function
* @param {scaler} scaler - The scaler object
* @param {object} options - An options object
* @param {boolean} [options.param1=false] - Param 1.
* @param {number} [options.param2=true] - Param 2.
* @return {Server}
* @example
* const sss = require('super-scaled-sockets');
* // .........
*/server, publisher
};

export default {
  server,
  publisher
};
