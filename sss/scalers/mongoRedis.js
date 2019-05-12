const mongoDb = require('mongodb');
const mongoSSS = require('./mongoSSS');
const redisSSS = require('./redisSSS');

module.exports = {
  connect: (mongoInfo, redisInfo, callback) => {
    // check if mongoInfo is a collection object
    if (mongoInfo.findOne) {
      redisSSS.connect(mongoSSS(mongoInfo), redisInfo, callback);
    } else {
      mongoDb.connect(mongoInfo.uri, { useNewUrlParser: true }, (err, client) => {
        if (err) {
          callback(err);
          return;
        }
        const redisTable = client.db(mongoInfo.dbName).collection(mongoInfo.collectionName);
        redisSSS.connect(mongoSSS(redisTable), redisInfo, callback);
      });
    }
  }
};
