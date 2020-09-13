export default class Loader {

/* ------------------------------------------------------------------ */
/* Static Methods */

  static reverseSamples(typedArr) {
    return Float32Array.from(typedArr).reverse();
  };



/* ------------------------------------------------------------------ */
/* Getters */

  get progress() {
    let prog = 0;
    if (this._filesTotal) {
      const files = (this._progFiles / this._filesTotal);
      prog += (files * .8);
    };
    if (this._samplesTotal) {
      const buffers = (this._progSamples / this._samplesTotal);
      prog += (buffers * .2);
    };
    return prog;
  };



/* ------------------------------------------------------------------ */
/* Constructor */

  constructor(sampleRate = 48e3, chunkSamples = 2048) {
    this._ctx = new OfflineAudioContext(2, chunkSamples * 100, sampleRate);
    this._chunkSamples = chunkSamples;
    this._buf = [];
    this._filesTotal = 0;
    this._samplesTotal = 0;
    this._progFiles = 0;
    this._progSamples = 0;
    this.load = this.load.bind(this);
    this.getSampleDataByChannel = this.getSampleDataByChannel.bind(this);
    this.getReverseSampleDataByChannel = this.getReverseSampleDataByChannel.bind(this);
  };



/* ------------------------------------------------------------------ */
/* Public methods */

  getSampleDataByChannel(channel = 0, startSample, endSample) {
    return this._buf[channel].subarray(startSample, endSample);
  };

  getReverseSampleDataByChannel(channel = 0, startSample, endSample) {
    return this.constructor.reverseSamples(
      this._buf[channel].subarray(startSample, endSample)
    );
  };



/* ------------------------------------------------------------------ */
/* Initialization methods */

  async load(tracks = []) {
    this._filesTotal = tracks.length;

    const buffersPromise = tracks.map(t => this.loadFile(t));
    const buffers = await Promise.all(buffersPromise);

    this._buf[0] = new Float32Array(this._samplesTotal);
    this._buf[1] = new Float32Array(this._samplesTotal);

    let lastIndex = 0;
    buffers.forEach(b => {
      const startIndex = lastIndex;
      lastIndex += b.length;
      b.copyFromChannel(this._buf[0].subarray(startIndex, lastIndex), 0, 0);
      b.copyFromChannel(this._buf[1].subarray(startIndex, lastIndex), 1, 0);
      this._progSamples += b.length;
    });

    return this._samplesTotal;
  };



/* ------------------------------------------------------------------ */
/* Initialization helper methods */

  async loadFile(filePath = '') {
    try {
      const res = await fetch(filePath);
      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = await this._ctx.decodeAudioData(arrayBuffer);
      this._progFiles += 1;
      this._samplesTotal += audioBuffer.length;
      return audioBuffer;
    } catch (err) {
      console.error('loadFile error', err);
      return null;
    };
  };



};
