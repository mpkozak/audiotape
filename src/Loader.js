export default class Loader {

/* ------------------------------------------------------------------ */
/* Constructor */

  constructor(sampleRate = 48e3) {
    // AudioContext
    this._ctx = new OfflineAudioContext(2, sampleRate, sampleRate);
    // Audio data
    this._chunkData = [];
    // Public methods
    this.load = this._load.bind(this);
    this.getSampleDataByChannel = this._getSampleDataByChannel.bind(this);
    this.getReverseSampleDataByChannel = this._getReverseSampleDataByChannel.bind(this);
  };



/* ------------------------------------------------------------------ */
/* Public Sample Data Methods */

  _getSampleDataByChannel(channel = 0, startSample, endSample) {
    const outputArray = new Float32Array(endSample - startSample);
    const startChunkIndex = this._chunkData
      .findIndex(c => c.endSample >= startSample);
    const startChunk = this._chunkData[startChunkIndex];
    const subArray = startChunk.data[channel]
      .subarray(
        startSample - startChunk.startSample,
        endSample - startChunk.startSample
      );
    outputArray.set(subArray, 0);
    if (subArray.length < outputArray.length) {   // requested samples span multiple chunks
      const overflowSamples = outputArray.length - subArray.length;
      const nextChunk = this._chunkData[startChunkIndex + 1];
      const nextSubArray = nextChunk.data[channel]
        .subarray(0, overflowSamples);
      outputArray.set(nextSubArray, subArray.length);
    };
    return outputArray;
  };


  _getReverseSampleDataByChannel(channel = 0, startSample, endSample) {
    return this._getSampleDataByChannel(channel, startSample, endSample).reverse();
  };



/* ------------------------------------------------------------------ */
/* Public Load Method + Helpers */

  async _load(files = [], loadCb = null) {
    const progressCb = this._load_genProgressCb(files.length, loadCb);
    const audioBuffers = await this._load_fetchAllBuffers(files, progressCb);
    const samplesTotal = this._load_populateChunkData(audioBuffers, progressCb);
    return samplesTotal;
  };


  _load_populateChunkData(audioBuffers, progressCb) {
    let currentSample = 0;
    for (let i in audioBuffers) {
      const currentBuffer = audioBuffers[i];
      this._chunkData[i] = {
        length: currentBuffer.length,
        data: [
          currentBuffer.getChannelData(0),
          currentBuffer.getChannelData(1),
        ],
        startSample: currentSample,
      };
      currentSample += currentBuffer.length;
      this._chunkData[i].endSample = currentSample;
      progressCb();
    };
    return currentSample;
  };


  async _load_fetchAllBuffers(urls = [], progressCb) {
    const buffers = await Promise.all(
      urls.map(url => this._load_fetchBuffer(url, progressCb))
    );
    return buffers.filter(b => b !== null);
  };


  async _load_fetchBuffer(url = '', progressCb) {
    try {
      const res = await fetch(url);
      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = await this._ctx.decodeAudioData(arrayBuffer);
      progressCb();
      return audioBuffer;
    } catch (err) {
      console.error('_load_fetchBuffer error', err);
      return null;
    };
  };


  _load_genProgressCb(totalFiles = 0, cb = null) {
    const loadProgressTotal = totalFiles * 2;
    let loadProgress = 0;
    const progressTickCb = typeof cb === 'function' ? cb : null;
    return () => {
      loadProgress++;
      if (progressTickCb) {
        progressTickCb(loadProgress / loadProgressTotal);
      };
    };
  };



};
