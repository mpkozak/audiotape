export default class Loader {

/* ------------------------------------------------------------------ */
/* Private fields */

  #ctx;
  #chunkSamples;
  #buf;
  #filesTotal;
  #samplesTotal;
  #progFiles;
  #progSamples;



/* ------------------------------------------------------------------ */
/* Static Methods */

  static reverseSamples(typedArr) {
    return Float32Array.from(typedArr).reverse();
  };



/* ------------------------------------------------------------------ */
/* Getters */

  get progress() {
    let prog = 0;
    if (this.#filesTotal) {
      const files = (this.#progFiles / this.#filesTotal);
      prog += (files * .8);
    };
    if (this.#samplesTotal) {
      const buffers = (this.#progSamples / this.#samplesTotal);
      prog += (buffers * .2);
    };
    return prog;
  };



/* ------------------------------------------------------------------ */
/* Constructor */

  constructor(sampleRate = 48e3, chunkSamples = 2048) {
    this.#ctx = new OfflineAudioContext(2, chunkSamples * 100, sampleRate);
    this.#chunkSamples = chunkSamples;
    this.#buf = [];
    this.#filesTotal = 0;
    this.#samplesTotal = 0;
    this.#progFiles = 0;
    this.#progSamples = 0;
    this.load = this.load.bind(this);
    this.getSampleDataByChannel = this.getSampleDataByChannel.bind(this);
    this.getReverseSampleDataByChannel = this.getReverseSampleDataByChannel.bind(this);
  };



/* ------------------------------------------------------------------ */
/* Public methods */

  getSampleDataByChannel(channel = 0, startSample, endSample) {
    return this.#buf[channel].subarray(startSample, endSample);
  };

  getReverseSampleDataByChannel(channel = 0, startSample, endSample) {
    return this.constructor.reverseSamples(
      this.#buf[channel].subarray(startSample, endSample)
    );
  };



/* ------------------------------------------------------------------ */
/* Initialization methods */

  async load(tracks = []) {
    this.#filesTotal = tracks.length;

    const buffersPromise = tracks.map(t => this.loadFile(t));
    const buffers = await Promise.all(buffersPromise);

    this.#buf[0] = new Float32Array(this.#samplesTotal);
    this.#buf[1] = new Float32Array(this.#samplesTotal);

    let lastIndex = 0;
    buffers.forEach(b => {
      const startIndex = lastIndex;
      lastIndex += b.length;
      b.copyFromChannel(this.#buf[0].subarray(startIndex, lastIndex), 0, 0);
      b.copyFromChannel(this.#buf[1].subarray(startIndex, lastIndex), 1, 0);
      this.#progSamples += b.length;
    });

    return this.#samplesTotal;
  };



/* ------------------------------------------------------------------ */
/* Initialization helper methods */

  async loadFile(filePath = '') {
    try {
      const res = await fetch(filePath);
      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = await this.#ctx.decodeAudioData(arrayBuffer);
      this.#progFiles += 1;
      this.#samplesTotal += audioBuffer.length;
      return audioBuffer;
    } catch (err) {
      alert(err)
      console.error('loadFile error', err);
      return null;
    };
  };



};
