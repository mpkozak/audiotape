export default class LoaderLite {

/* ------------------------------------------------------------------ */
/* Static Properties */

  // chunk cache parameters
  static ADJACENT_CHUNK_CACHE_LENGTH = 2;



/* ------------------------------------------------------------------ */
/* Constructor */

  constructor(sampleRate = 48e3) {
    // AudioContext
    this._ctx = new OfflineAudioContext(2, sampleRate, sampleRate);
    // Audio data
    this._resBlobs = [];
    this._chunkData = [];
    this._chunkDataBusy = false;
    // Public methods
    this.load = this._load.bind(this);
    this.getSampleDataByChannel = this._getSampleDataByChannel.bind(this);
    this.getReverseSampleDataByChannel = this._getReverseSampleDataByChannel.bind(this);
  };



/* ------------------------------------------------------------------ */
/* Public Sample Data Methods */

  async _getSampleDataByChannel(channel = 0, startSample, endSample) {
    const outputArray = new Float32Array(endSample - startSample);
    const startChunkIndex = this._chunkData
      .findIndex(c => c.endSample >= startSample);
    const startChunk = this._chunkData[startChunkIndex];
    if (startChunk.data === null) {
      await this._read_refreshChunkAudioData(startChunkIndex);
    };
    const subArray = startChunk.data[channel]
      .subarray(
        startSample - startChunk.startSample,
        endSample - startChunk.startSample
      );
    outputArray.set(subArray, 0);
    if (subArray.length < outputArray.length) {   // requested samples span multiple chunks
      const overflowSamples = outputArray.length - subArray.length;
      const nextChunkIndex = startChunkIndex + 1;
      const nextChunk = this._chunkData[nextChunkIndex];
      if (nextChunk.data === null) {
        console.warn('Sample buffer underrun!');
        await this._read_refreshChunkAudioData(nextChunkIndex);
      };
      const nextSubArray = nextChunk.data[channel]
        .subarray(0, overflowSamples);
      outputArray.set(nextSubArray, subArray.length);
      this._read_refreshChunkAudioData(nextChunkIndex);
    };
    return outputArray;
  };


  async _getReverseSampleDataByChannel(channel = 0, startSample, endSample) {
    return await this.getSampleDataByChannel(channel, startSample, endSample)
      .then(data => data.reverse());
  };



/* ------------------------------------------------------------------ */
/* Read Method + Helpers */

  async _read_refreshChunkAudioData(chunkIndex) {
    if (this._chunkDataBusy === chunkIndex) return null;
    await this._read_awaitBusy();
    this._chunkDataBusy = chunkIndex;
    const minIndex = chunkIndex - this.constructor.ADJACENT_CHUNK_CACHE_LENGTH;
    const maxIndex = chunkIndex + this.constructor.ADJACENT_CHUNK_CACHE_LENGTH;
    for (let i = 0; i < this._chunkData.length; i++) {
      if (i >= minIndex && i <= maxIndex) {
        if (this._chunkData[i].data === null) {
          this._chunkData[i].data = await this._read_decodeChunkAudioData(i);
        };
        continue;
      };
      if (this._chunkData[i].data !== null) {
        this._chunkData[i].data = null;
      };
    };
    this._chunkDataBusy = false;
  };


  async _read_decodeChunkAudioData(chunkIndex) {
    const tempResBuffer = await this._resBlobs[chunkIndex].arrayBuffer();
    const tempAudioBuffer = await this._ctx.decodeAudioData(tempResBuffer);
    return [
      tempAudioBuffer.getChannelData(0),
      tempAudioBuffer.getChannelData(1),
    ];
  };


  async _read_awaitBusy() {
    while (this._chunkDataBusy !== false) {
      console.log('waiting for chunkdatabusy')
      await new Promise(res => setTimeout(res, 16));
    };
    return true;
  };



/* ------------------------------------------------------------------ */
/* Public Load Method + Helpers */

  async _load(files = [], loadCb = null, params = {}) {
    const {
      exact = false,
    } = params;
    const progressCb = this._load_genProgressCb(files.length, loadCb);
    this._resBlobs = await this._load_fetchAllBlobs(files, progressCb);
    const samplesTotal = await this._load_populateChunkData(progressCb, exact);
    return samplesTotal;
  };


  async _load_populateChunkData(progressCb, exact = false) {
    let currentSample = 0,
        tempResBuffer,
        tempAudioBuffer;
    for (let i in this._resBlobs) {
      this._chunkData[i] = {};
      this._chunkData[i].startSample = currentSample;
      if (i < 2 || !exact) {
        tempResBuffer = await this._resBlobs[i].arrayBuffer();
        tempAudioBuffer = await this._ctx.decodeAudioData(tempResBuffer);
      };
      if (i < 2) {
        this._chunkData[i].data = [
          tempAudioBuffer.getChannelData(0),
          tempAudioBuffer.getChannelData(1),
        ];
      } else {
        this._chunkData[i].data = null;
      };
      currentSample += tempAudioBuffer.length;
      this._chunkData[i].endSample = currentSample - 1;
      progressCb();
    };
    return currentSample;
  };


  async _load_fetchAllBlobs(urls = [], progressCb) {
    const blobs = await Promise.all(
      urls.map(url => this._load_fetchBlob(url, progressCb))
    );
    return blobs.filter(b => b !== null);
  };


  async _load_fetchBlob(url = '', progressCb) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      progressCb();
      return blob;
    } catch (err) {
      console.error('_load_fetchBlob error', err);
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
