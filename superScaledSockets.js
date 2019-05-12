const mongoRedis = require('./scalers/mongoRedis');
const server = require('./server');

module.exports = {
  scaler: {
    mongoRedis: mongoRedis
  },
  server: server
};
