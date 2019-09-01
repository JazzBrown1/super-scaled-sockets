import plCodes from './plCodes';

export default function (scaler, callback) {
  const obj = {
    _scaler: scaler,
    publish: function publish(channelName, topic, msg, _callback) {
      const payload = {
        sys: plCodes.FEED, topic, msg, channel: channelName
      };
      this._scaler.publish(channelName, payload, (err, uid) => {
        if (_callback) _callback(err, uid);
      });
    },
    broadcast: function broadcast(topic, msg, _callback) {
      const payload = {
        sys: plCodes.BROADCAST, topic, msg,
      };
      this._scaler.publish('_bc_', payload, (err, uid) => {
        if (_callback) _callback(err, uid);
      });
    },
    bootAll: function bootAll(channelName, reason, _callback) {
      const payload = {
        sys: plCodes.BOOT,
        reason: reason || 'none'
      };
      this._scaler.publish(channelName, payload, (err, uid) => {
        if (_callback) _callback(err, uid);
      });
    }
  };
  if (callback) callback(obj);
  return obj;
}
