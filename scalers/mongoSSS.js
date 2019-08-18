const mongo = require('mongodb');

const errorMessages = {
  nullResult: {
    name: 'Null result in Mongo Db',
    message: 'A record with the id does not exist'
  }
};

const mongoSSS = (table) => ({
  save: (channel, data, callback) => {
    table.insertOne({ channel: channel, data: data }, (err, result) => {
      if (!err) {
        callback(null, result.insertedId.toString());
      } else callback(err, null);
    });
  },
  get: (c, id, callback) => {
    table.findOne({ _id: new mongo.ObjectId(id) }, (err, result) => {
      if (!err) {
        if (result !== null) {
          result.data.uid = id;
          callback(null, result.data);
        } else callback(errorMessages.nullResult, null);
      } else callback(err, null);
    });
  },
  getLast: (channel, callback) => {
    table.find({ channel: channel }).sort({ _id: -1 }).limit(1).toArray((err, _result) => {
      if (!err) {
        if (_result[0]) {
          const result = _result[0];
          result.data.uid = result._id.toString();
          callback(null, result.data.uid, result.data);
        } else callback(null, null);
      } else callback(err, null);
    });
  },
  getSince: (channel, id, callback) => {
    table.find({ channel: channel, _id: { $gt: mongo.ObjectId(id) } }).sort({ _id: -1 }).toArray((err, result) => {
      if (!err) {
        if (result > 0) {
          result.forEach((record) => {
            record.data.uid = record._id.toString();
          });
          callback(null, result.data._id, result.data);
        } else callback(null, null);
      } else callback(err, null);
    });
  }
});

module.exports = mongoSSS;
