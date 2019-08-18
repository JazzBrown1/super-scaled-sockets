const redis = require('redis');

const redisSSS = {};

redisSSS.connect = (dataStore, connectionOptions, callback) => {
  const ignoreList = [];
  let connectionCount = 0;
  let handleError = null;
  let msgListener = () => {};
  const sub = redis.createClient(connectionOptions);
  const pub = redis.createClient(connectionOptions);
  const lastUpdates = {};

  const shouldIgnore = (id) => {
    const _index = ignoreList.findIndex((_id) => id === _id);
    if (_index !== -1) {
      ignoreList.splice(_index, 1);
      return true;
    }
    return false;
  };

  sub.on('message', (channel, id) => {
    if (!shouldIgnore(id)) {
      lastUpdates[channel] = id;
      const getData = (_callback) => {
        dataStore.get(channel, id, (err, data) => {
          _callback(err, data);
        });
      };
      msgListener(channel, getData);
    }
  });

  const connection = {};

  connection.subscribe = (channel) => {
    sub.subscribe(channel);
    dataStore.getLast(channel, (err, uid) => {
      if (!err) lastUpdates[channel] = uid;
    });
  };

  connection.unsubscribe = (channel) => {
    sub.unsubscribe(channel);
  };

  connection.onMessage = (_callback) => {
    msgListener = _callback;
  };

  connection.onError = (_callback) => {
    handleError = _callback;
  };

  connection.publish = (channel, data, _callback) => {
    dataStore.save(channel, data, (err, id) => {
      if (!err) {
        ignoreList.push(id);
        lastUpdates[channel] = id;
        pub.publish(channel, id);
        if (_callback) _callback(null, id);
      } else if (_callback) _callback(err);
    });
  };

  connection.isSynced = function isSynced(channel, id, _callback) {
    this.getLastId(channel, (err, _id) => {
      _callback(err, Boolean(id === _id));
    });
  };

  connection.getLastId = (channel, _callback) => {
    if (lastUpdates[channel]) {
      _callback(null, lastUpdates[channel]);
    } else {
      dataStore.getLast(channel, (err, uid) => {
        _callback(err, uid);
      });
    }
  };

  connection.getSince = dataStore.getSince;

  connection.publishToMany = (channels, data, _callback) => {
    dataStore.save(channels, data, (err, id) => {
      if (!err) {
        channels.forEach((channel) => {
          ignoreList.push(id);
          pub.publish(channel, id);
        });
        _callback(null);
      } else {
        _callback(err);
      }
    });
  };
  sub.on('connect', () => {
    if (++connectionCount === 2) {
      // callback once both connections are established
      callback(null, connection);
    }
  });
  pub.on('connect', () => {
    if (++connectionCount === 2) {
      callback(null, connection);
    }
  });
  pub.on('error', (error) => {
    if (connectionCount > 1) {
      if (handleError) {
        handleError(error);
      }
    } else {
      callback(error, null);
    }
  });
  sub.on('error', (error) => {
    if (connectionCount > 1) {
      if (handleError) {
        handleError(error);
      }
    } else {
      // callback an error if the connection count has not been reached
      callback(error, null);
    }
  });
};

module.exports = redisSSS;
