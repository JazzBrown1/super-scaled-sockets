
const Slave = require('./slave');

const defaults = {
  slaveUpdateInterval: 30000
};

const applyPrefs = (prefs) => {
  const _prefs = Object.assign(defaults);
  Object.keys(prefs).forEach((key) => {
    if (_prefs[key] !== undefined) _prefs[key] = prefs[key];
  });
  return _prefs;
};

const Master = function Master(scaler, prefs) {
  this._scaler = scaler;
  this._prefs = applyPrefs(prefs);
  this.clientsCount = 0;
  this._slaves = {};
  this._alerts = {};
  this._onSlave = null;
  this._newSlave = function _newSlave(id) {
    this._slaves[id] = new Slave(id);
    return this._slaves[id];
  };
  this._sendToInstance = function _sendToInstance(id, msg, cb) {
    this._scaler.publish(id, JSON.stringify(msg), cb);
  };
  this._sendToAll = function _sendToAll(msg, cb) {
    this._scaler.publish('_s_', JSON.stringify(msg), cb);
  };
  this._scaler.onMessage((channelName, getData) => {
    getData((data) => {
      switch (data.type) {
        case 1: // update
          this._slaves[data.id]._handleUpdate(data);
          break;
        case 2: // register
          this._newSlave(data.id, data);
          break;
        case 3: // closing
          this._slaves[data.id]._handleSlaveClose(data.reason);
          break;
        case 4: // opening
          this._newSlave(`_-${data.uid}`, data);
          break;
        default:
          // should not happen
      }
    });
  });
  this.start = function start() {
    setInterval(() => {
      Object.keys(this._slaves).forEach((key) => {
        const slave = this._slaves[key];
        if (!slave._updateStatus) {
          slave._handleNoUpdate();
          return;
        }
        slave._updateStatus = false;
        slave.update();
      });
      // hb
    }, this._prefs.slaveUpdateInterval);
  };
  this.onSlave = function onSlave(callback) {
    this._onSlave = callback;
  };
};

export default (scaler) => new Master(scaler);
