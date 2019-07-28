const mongoRedis = require('../scalers/mongoRedis');
const Server = require('./server');
const publisher = require('./publisher');

module.exports = {
  scaler: {
    mongoRedis: mongoRedis
  },
  server: (scaler, prefs) => new Server(scaler, prefs),
  publisher: publisher
};
