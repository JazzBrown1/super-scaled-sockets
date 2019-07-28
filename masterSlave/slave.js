const Slave = function Slave(master, startData) {
  this._updateStatus = true;
  this._status = true;
  this._id = startData.id;
  this._ip = startData.ip;
  this._port = startData.port;
  this._onUpdate = null;

  this._vitals = {
    clientsCount: null,
    subscriptionsCount: null,
    reqsPerMin: null,
    sendsPerMin: null,
    latency: null,
    avgResponseTime: null
  };
  this._updateVitals = function _updateVitals(newData) {
    Object.keys(newData).forEach((key) => {
      if (this._vitals[key] !== undefined) this._vitals[key] = newData[key];
    });
    if (this._onUpdate) this._onUpdate(this._id, { ip: this._ip, port: this._port }, this._vitals);
  };
  this._updateVitals(startData._vitals);

  this._handleNoHb = function _handleNoHb() {
    // send isAlive -- requires imediate response
  };

  this.close = function close() {

  };

  this.update = function update() {

  };
  this.onUpdate = function onUpdate(callback) {
    this._onUpdate = callback;
  };
};


export default (master, startData) => new Slave(master, startData);
