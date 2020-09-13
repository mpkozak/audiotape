


var AudioBuffer = global.AudioBuffer;



function installCopyFromChannel() {
  if (AudioBuffer.prototype.hasOwnProperty("copyFromChannel")) return;

  console.log('INSTALLING: AudioBuffer.copyFromChannel()');

  AudioBuffer.prototype.copyFromChannel = function (destination, channelNumber, startInChannel) {
    var source = this.getChannelData(channelNumber | 0).subarray(startInChannel | 0);
    destination.set(source.subarray(0, Math.min(source.length, destination.length)));
  };
};



function installCopyToChannel() {
  if (AudioBuffer.prototype.hasOwnProperty("copyToChannel")) return;

  console.log('INSTALLING: AudioBuffer.copyToChannel()');

  AudioBuffer.prototype.copyToChannel = function (source, channelNumber, startInChannel) {
    var clipped = source.subarray(0, Math.min(source.length, this.length - (startInChannel || 0)));
    this.getChannelData(channelNumber | 0).set(clipped, startInChannel | 0);
  };
};





export default function install() {
  void installCopyFromChannel();
  void installCopyToChannel();
};
