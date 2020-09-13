


function installAudioContext() {
  if (global.AudioContext) return;

  console.log('INSTALLING: AudioContext');

  global.AudioContext = global.webkitAudioContext;
};



function installOfflineAudioContext() {
  if (global.OfflineAudioContext) return;

  console.log('INSTALLING: OfflineAudioContext');

  global.OfflineAudioContext = global.webkitOfflineAudioContext;
};



function installDecodeAudioData() {
  var OriginalAudioContext = global.AudioContext || global.webkitAudioContext;
  var OriginalOfflineAudioContext = global.OfflineAudioContext || global.webkitOfflineAudioContext;

  function nop() {};

  var audioContext = new OriginalOfflineAudioContext(1, 1, 44100);
  var isPromiseBased = false;

  try {
    var audioData = new Uint32Array([1179011410, 48, 1163280727, 544501094, 16, 131073, 44100, 176400, 1048580, 1635017060, 8, 0, 0, 0, 0]).buffer;
    isPromiseBased = !!audioContext.decodeAudioData(audioData, nop);
  } catch (e) {
    nop(e);
  };

  if (isPromiseBased) return;

  var decodeAudioData = OriginalAudioContext.prototype.decodeAudioData;

  console.log('INSTALLING: AudioContext.decodeAudioData()');

  global.AudioContext.prototype.decodeAudioData = function (audioData, successCallback, errorCallback) {
    var _this = this;
    var promise = new Promise(function (resolve, reject) {
      return decodeAudioData.call(_this, audioData, resolve, reject);
    });
    promise.then(successCallback, errorCallback);
    return promise;
  };

  console.log('INSTALLING: OfflineAudioContext.decodeAudioData()');

  global.OfflineAudioContext.prototype.decodeAudioData = function (audioData, successCallback, errorCallback) {
    var _this = this;
    var promise = new Promise(function (resolve, reject) {
      return decodeAudioData.call(_this, audioData, resolve, reject);
    });
    promise.then(successCallback, errorCallback);
    return promise;
  };
};





export default function install() {
  void installAudioContext();
  void installOfflineAudioContext();
  void installDecodeAudioData();
};
