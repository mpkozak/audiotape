import { Loader } from './';





export default class Player {

/* ------------------------------------------------------------------ */
/* Private fields */

  #ctx;
  #sampleRate;
  #rampChunkSamples;
  #chunkSamples;
  #chunkSeconds;
  #totalSamples;
  #totalChunks;
  #Loader;
  #lookaheadSeconds
  #uiLatency;
  #playbackSpeeds;
  #resumeChunk;
  #scheduleQueue;
  #transportQueue
  #playState;
  #scrubState;
  #transportDirection;
  #transportSpeed;
  #masterGain;



/* ------------------------------------------------------------------ */
/* Static Methods */

  static calcRampChunkSamples(sampleRate, targetRampChunkSeconds) {
    const kBinSamples = 128;
    const minRampChunkKBins = 4;
    const targetRampChunkSamples = Math.floor(sampleRate * targetRampChunkSeconds);
    const targetRampChunkKBins = Math.round(targetRampChunkSamples / kBinSamples);
    const rampChunkKBins = Math.max(minRampChunkKBins, targetRampChunkKBins);
    const rampChunkSamples = rampChunkKBins * kBinSamples;
    return rampChunkSamples;
  };

  static sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
  };

  static clampValidNumber(val, minVal) {
    if (typeof val === 'number' && val >= minVal) {
      return val;
    };
    return minVal;
  };



/* ------------------------------------------------------------------ */
/* Getters */


  get active() {
    return this.#ctx.state === 'running';
  };

  get buffered() {
    return !!this.#totalSamples;
  };

  get totalLength() {
    return this.#totalSamples / this.#sampleRate;
  };

  get transportBusy() {
    return (this.#playState === -1) || (this.#scrubState === -1) || !this.#transportDirection;
  };

  get playing() {
    return (this.#playState !== 0) || this.transportBusy;
  };

  get playhead() {
    const now = this.#ctx.currentTime;
    const nowChunk = this.#scheduleQueue.find(c => (
      (c.startTime < now) && ((c.startTime + c.playSeconds) > now)
    ));
    if (!nowChunk) {
      return this.#resumeChunk * this.#chunkSeconds;
    };
    const baseStartTime = nowChunk.id * this.#chunkSeconds;
    const elapsedTime = this.#ctx.currentTime - nowChunk.startTime;
    const baseElapsedTime = elapsedTime * nowChunk.node.playbackRate.value;
    return baseStartTime + (baseElapsedTime * this.#transportDirection);
  };

  get lookahead() {
    return this.#lookaheadSeconds;
  };

  get latency() {
    return this.#uiLatency;
  };



/* ------------------------------------------------------------------ */
/* Setters */

  set lookahead(seconds) {
    this.#lookaheadSeconds = this.constructor.clampValidNumber(seconds, 10);
  };

  set latency(seconds) {
    this.#uiLatency = this.constructor.clampValidNumber(seconds, .01);
  };



/* ------------------------------------------------------------------ */
/* Constructor */

  constructor({
    sampleRate = 48e3,
    chunkSeconds = .02,
    lookahead = 2,
    latency = .1,
    playbackSpeed = 1,
    scrubSpeed = 5,
  } = {}) {
    this.#ctx = new AudioContext({ sampleRate });
    this.#sampleRate = this.#ctx.sampleRate;
    this.#rampChunkSamples = this.constructor.calcRampChunkSamples(this.#sampleRate, chunkSeconds);
    this.#chunkSamples = this.#rampChunkSamples * 2;
    this.#chunkSeconds = this.#chunkSamples / this.#sampleRate;
    this.#totalSamples = 0;
    this.#totalChunks = 0;
    this.#Loader = new Loader(this.#sampleRate, this.#chunkSamples);
    this.#lookaheadSeconds = this.constructor.clampValidNumber(lookahead, 10);
    this.#uiLatency = this.constructor.clampValidNumber(latency, .01);
    this.#playbackSpeeds = {
      min: .01,
      base: playbackSpeed,
      scrub: scrubSpeed,
    };
    this.#resumeChunk = 0;
    this.#scheduleQueue = [];
    this.#transportQueue = [];
    this.#playState = 0;            /* -1 = pending; 0 = stopped; 1 = playing; */
    this.#scrubState = 0;           /* -1 = pending; 0 = normal; 1 = ff; */
    this.#transportDirection = 1;   /* -1 = reverse; 0 = pending; 1 = forward; */
    this.#transportSpeed = this.#playbackSpeeds.min;
    this.#masterGain = this.#ctx.createGain();
    this.#masterGain.connect(this.#ctx.destination);
    this.#masterGain.gain.value = 1;
    this.checkSchedule = this.checkSchedule.bind(this);
    this.transport = {
      play: this.play.bind(this),
      stop: this.stop.bind(this),
      rew_start: this.rew_start.bind(this),
      rew_stop: this.rew_stop.bind(this),
      ff_start: this.ff_start.bind(this),
      ff_stop: this.ff_stop.bind(this),
    };
  };



/* ------------------------------------------------------------------ */
/* Initialization methods */

  activate() {
    if (!this.active) {
      this.#ctx.resume();
    };
  };


  async load(filePaths, cb = null) {
    if (this.playing) {
      // console.warn('LOAD --- cannot load while playing');
      return null;
    };

    let pending = undefined;
    try {
      const loadPromise = this.#Loader.load(filePaths);
      if (cb) {
        let p = 0;
        pending = p < 1;
        while(pending === true) {
          const nextP = this.#Loader.progress;
          if (nextP !== p) {
            p = nextP;
            pending = p < 1;
            cb(p);
            if (p >= 1) break;
          };
          await this.constructor.sleep(32);
        };
      };
      this.#totalSamples = await loadPromise;
      this.#totalChunks = this.#totalSamples / this.#chunkSamples;
      return true;
    } catch (err) {
      console.error(err);
      pending = false;
      return null;
    };
  };



/* ------------------------------------------------------------------ */
/* Sample data loader interface methods */

  getBuffer(chunkIndex) {
    const startSample = chunkIndex * this.#chunkSamples;
    const endSample = (chunkIndex + 1) * this.#chunkSamples;
    const buffer = this.#ctx.createBuffer(2, this.#chunkSamples, this.#sampleRate);
    if (this.#transportDirection < 0) {
      buffer.copyToChannel(this.#Loader.getReverseSampleDataByChannel(0, startSample, endSample), 0, 0);
      buffer.copyToChannel(this.#Loader.getReverseSampleDataByChannel(1, startSample, endSample), 1, 0);
    } else {
      buffer.copyToChannel(this.#Loader.getSampleDataByChannel(0, startSample, endSample), 0, 0);
      buffer.copyToChannel(this.#Loader.getSampleDataByChannel(1, startSample, endSample), 1, 0);
    };
    return buffer;
  };


  getBufferBatch(startChunkIndex, endChunkIndex) {
    const buffers = [];
    let startIndex = startChunkIndex
    while (startIndex < endChunkIndex) {
      buffers.push(this.getBuffer(startIndex++));
    };
    return buffers;
  };



/* ------------------------------------------------------------------ */
/* Scheduling methods */

  clampClock(time) {
    const timeSamples = time * this.#sampleRate;
    const timeSamplesInt = Math.round(timeSamples);
    const timeSeconds = timeSamplesInt / this.#sampleRate;
    return timeSeconds;
  };


  scheduleChunk(chunk) {
    chunk.node.start(chunk.startTime, 0);
    this.#scheduleQueue.push(chunk);
  };


  scheduleChunks(chunks, start) {
    let nextStartTime = this.clampClock(start);
    chunks.forEach(chunk => {
      chunk.startTime = nextStartTime;
      chunk.playSeconds = (chunk.node.buffer.length / this.#sampleRate) / chunk.node.playbackRate.value;
      nextStartTime += chunk.playSeconds;
      void this.scheduleChunk(chunk);
    });
  };


  cancelChunksAfter(startTime) {
    this.#scheduleQueue.forEach((q, qi) => {
      q.node.onended = null;
      if (q.startTime >= startTime) {
        q.node.disconnect(this.#masterGain);
        q.node.stop();
      };
    });
    const spliceIndexStart = this.#scheduleQueue
      .findIndex(q => q.startTime >= startTime);
    this.#scheduleQueue.splice(spliceIndexStart);
  };


  refillQueue() {
    const endTime = this.#ctx.currentTime + this.lookahead;
    let lastChunk = this.#scheduleQueue[this.#scheduleQueue.length - 1];
    if (!lastChunk) {
      // console.warn('REFILL QUEUE --- no last chunk');
      return null;
    };

    while (lastChunk.startTime < endTime) {
      const nextStartTime = lastChunk.startTime + lastChunk.playSeconds;
      let nextChunkIndex = lastChunk.id + this.#transportDirection;
      if (Math.floor(nextChunkIndex) !== nextChunkIndex) {
        const lastSampleLength = lastChunk.node.buffer.length;
        const nextSampleStart = lastChunk.startSample + (lastSampleLength * this.#transportDirection);
        nextChunkIndex = nextSampleStart / this.#chunkSamples;
      };
      if (nextChunkIndex >= this.#totalChunks) {
        // console.warn('REFILL QUEUE --- next chunk after range')
        return null;
      };
      if (nextChunkIndex < 0) {
        // console.warn('REFILL QUEUE --- next chunk before range')
        return null;
      };
      const nextChunk = this.getChunk(nextChunkIndex);
      nextChunk.startTime = nextStartTime;
      nextChunk.playSeconds = (nextChunk.node.buffer.length / this.#sampleRate) / nextChunk.node.playbackRate.value;
      void this.scheduleChunk(nextChunk);
      lastChunk = this.#scheduleQueue[this.#scheduleQueue.length - 1];
    };
  };


  checkSchedule(e) {
    e.target.removeEventListener('ended', this.checkSchedule);

    if (this.#scheduleQueue.length < 2) {
      // console.warn('CHECK SCHEDULE --- not enough in queue');
      const lastChunk = this.#scheduleQueue[0];
      if (lastChunk) {
        // console.log('setting resume chunk', lastChunk)
        this.#resumeChunk = lastChunk.id;
        this.#scheduleQueue.splice(0);
        this.#playState = 0;
      };
      return null;
    };

    const now = this.#ctx.currentTime;
    let nextStartTime = this.#scheduleQueue[1].startTime;
    while (nextStartTime < now) {
      // this.#scheduleQueue[0].node.onended = null;
      this.#scheduleQueue[0].node.removeEventListener('ended', this.checkSchedule);
      this.#scheduleQueue.shift();
      if (this.#scheduleQueue.length < 2) break;
      nextStartTime = this.#scheduleQueue[1].startTime;
    };

    if (this.transportBusy) {
      // console.log('CHECK SCHEDULE --- transport is busy');
      return null;
    };

    if (this.#playState === 0) {
      // console.log('CHECK SCHEDULE --- transport is stopped');
      return null;
    };

    this.refillQueue();
  };



/* ------------------------------------------------------------------ */
/* Transport helper methods */

  getChunk(chunkIndex) {
    const chunk = {
      id: chunkIndex,
      node: this.#ctx.createBufferSource(),
      startSample: chunkIndex * this.#chunkSamples,
    };
    chunk.node.buffer = this.getBuffer(chunkIndex);
    chunk.node.playbackRate.value = this.#transportSpeed;
    chunk.node.onended = this.checkSchedule;
    chunk.node.connect(this.#masterGain);
    return chunk;
  };


  getSpeedRampChunks(startChunkIndex, lengthSeconds, startSpeed, endSpeed) {
    const rampParams = this.calcRampParams(startSpeed, endSpeed, lengthSeconds);
    return this.genRampChunks(startChunkIndex, rampParams);
  };


  getReverseSpeedRampChunks(startChunkIndex, lengthSeconds, startSpeed, endSpeed) {
    const rampParams = this.calcRampParams(startSpeed, endSpeed, lengthSeconds);
    return this.genRampChunks(startChunkIndex, rampParams, true);
  };


  calcRampParams(startSpeed, endSpeed, lengthSeconds) {
    const lengthSamples = lengthSeconds * this.#sampleRate;
    const lengthRampChunks = Math.floor(lengthSamples / this.#rampChunkSamples);
    const speedRange = endSpeed - startSpeed;
    const speedStep = speedRange / lengthRampChunks;
    const rampChunkParams = new Array(lengthRampChunks).fill()
      .map((d, i) => {
        const speedApprox = startSpeed + (i * speedStep);
        const lengthSrcSamples = Math.round(this.#rampChunkSamples * speedApprox);
        const speed = lengthSrcSamples / this.#rampChunkSamples;
        return {
          lengthSrcSamples,
          speed,
        };
      });
    const lengthSrcSamples = rampChunkParams
      .reduce((acc, d) => acc += d.lengthSrcSamples, 0);
    const lengthChunks = Math.ceil(lengthSrcSamples / this.#chunkSamples);
    const lengthTotalSamples = lengthChunks * this.#chunkSamples;
    const overflowSamples = lengthTotalSamples - lengthSrcSamples;
    if (overflowSamples < 0) {
      // console.warn('CALC RAMP PARAMS --- sample calc underrun');
    };
    if (overflowSamples > 0) {
      rampChunkParams.push({
        lengthSrcSamples: overflowSamples,
        speed: endSpeed,
      });
    };
    const durationSeconds = (lengthRampChunks *  this.#rampChunkSamples) / this.#sampleRate;
    return {
      rampChunkParams,
      lengthChunks,
      durationSeconds,
    };
  };


  genRampChunks(startChunkIndex, rampParams, reverse = false) {
    const { rampChunkParams, lengthChunks, durationSeconds } = rampParams;
    const endChunkIndex = startChunkIndex + (reverse ? -lengthChunks : lengthChunks);
    const rampStartSample = startChunkIndex * this.#chunkSamples;
    if (rampStartSample < 0 || rampStartSample >= this.#totalSamples) {
      // console.warn('GEN RAMP CHUNKS --- start out of bounds');
    };
    const rampEndSample = endChunkIndex * this.#chunkSamples;
    if (rampEndSample < 0 || rampEndSample >= this.#totalSamples) {
      // console.warn('GEN RAMP CHUNKS --- end out of bounds');
    };
    let nextStartSample = rampStartSample;
    const rampChunks = rampChunkParams.map(r => {
      const startSample = nextStartSample;
      if (reverse) {
        nextStartSample -= r.lengthSrcSamples;
      } else {
        nextStartSample += r.lengthSrcSamples;
      };
      const chunk = {
        id: startSample / this.#chunkSamples,
        node: this.#ctx.createBufferSource(),
        startSample: startSample,
      };
      chunk.node.buffer = this.#ctx.createBuffer(2, r.lengthSrcSamples, this.#sampleRate);
      if (reverse) {
        chunk.node.buffer.copyToChannel(this.#Loader.getReverseSampleDataByChannel(0, nextStartSample, startSample), 0, 0);
        chunk.node.buffer.copyToChannel(this.#Loader.getReverseSampleDataByChannel(1, nextStartSample, startSample), 1, 0);
      } else {
        chunk.node.buffer.copyToChannel(this.#Loader.getSampleDataByChannel(0, startSample, nextStartSample), 0, 0);
        chunk.node.buffer.copyToChannel(this.#Loader.getSampleDataByChannel(1, startSample, nextStartSample), 1, 0);
      };
      chunk.node.playbackRate.value = r.speed;
      chunk.node.onended = this.checkSchedule;
      chunk.node.connect(this.#masterGain);
      return chunk;
    });
    if (nextStartSample !== rampEndSample) {
      const diff = nextStartSample - rampEndSample;
      // console.warn('GEN RAMP CHUNKS --- sample lengths do not match', diff)
    };
    return {
      rampChunks,
      endChunkIndex,
      durationSeconds,
    };
  };



/* ------------------------------------------------------------------ */
/* Audio methods */

  rampGainAtTime(val, startTime, endTime, cancel = true) {
    const node = this.#masterGain.gain;
    if (cancel) {
      node.cancelScheduledValues(startTime);
      const nowVal = node.value;
      node.linearRampToValueAtTime(nowVal, startTime);
    };
    node.linearRampToValueAtTime(val, endTime);
  };



/* ------------------------------------------------------------------ */
/* Transport queue management */

  async waitForTransport() {
    while (this.transportBusy) {
      await this.constructor.sleep(16);
    };
    return true;
  };


  getNextSafeChunk(targetTime) {
    const minTimeTarget = targetTime || this.#ctx.currentTime + this.#uiLatency;
    const reqdChunks = this.#scheduleQueue.filter(c => c.REQD === true);
    const minReqdTargetTime = (reqdChunks.length)
      ? reqdChunks[reqdChunks.length - 1]
      : minTimeTarget;
    const chunk = this.#scheduleQueue.find(c => c.startTime >= minReqdTargetTime);
    if (!chunk) return null;
    return chunk;
  };


  calcSpeedRampDuration(startSpeed, endSpeed) {
    const baseDelta = Math.abs(startSpeed - endSpeed);
    const sqrt = Math.sqrt(baseDelta);
    return sqrt;
  };


  async requestTransport() {
    if (!this.buffered) {
      return null;
    };
    if (this.transportBusy) {
      await this.waitForTransport();
    };
    if (this.#transportQueue.length) {
      this.#transportQueue.splice(1);
    } else {
      return null;
    };
    this.deltaTransport(this.#transportQueue.pop());
  };


  async deltaTransport({ playState, scrubState, transportDirection, id } = {}) {
    const oldPlayState = this.#playState;
    const oldScrubState = this.#scrubState;
    const oldTransportDirection = this.#transportDirection;
    let newPlayState;
    let newScrubState;
    let newTransportDirection;
    if ((playState !== undefined) && (playState !== oldPlayState)) {
      newPlayState = playState;
      this.#playState = -1;
    };
    if ((scrubState !== undefined) && (scrubState !== oldScrubState)) {
      newScrubState = scrubState;
      this.#scrubState = -1;
    };
    if ((transportDirection !== undefined) && (transportDirection !== oldTransportDirection)) {
      newTransportDirection = transportDirection;
      this.#transportDirection = 0;
    };
    if (!this.transportBusy) return null;

    let startChunkIndex,
        startTime,
        startSpeed,
        endSpeed = this.#playbackSpeeds.base,
        endGain = 1;

    const nextSafeChunk = this.getNextSafeChunk();
    if (!nextSafeChunk) {
      startChunkIndex = this.#resumeChunk;
      startTime = this.clampClock(this.#ctx.currentTime + this.#uiLatency);
      startSpeed = this.#playbackSpeeds.min;
    } else {
      startChunkIndex = nextSafeChunk.id;
      startTime = nextSafeChunk.startTime;
      startSpeed = nextSafeChunk.node.playbackRate.value;
      void this.cancelChunksAfter(startTime);
    };

    if (newPlayState !== undefined) {
      if (newPlayState === 0) {
        endSpeed = this.#playbackSpeeds.min;
        endGain = 0;
      };
    };
    if (newScrubState !== undefined) {
      if (newScrubState === 1) {
        endSpeed = this.#playbackSpeeds.scrub;
      };
    };

    const speedRampChunks = [];
    let endChunkIndex;

    if (newTransportDirection === undefined) {
      const speedRampLengthSeconds = this.calcSpeedRampDuration(startSpeed, endSpeed);
      const speedRamp = this.getSpeedRampChunks(startChunkIndex, speedRampLengthSeconds, startSpeed, endSpeed);
      speedRampChunks.push(...speedRamp.rampChunks);
      endChunkIndex = speedRamp.endChunkIndex;
      const gainRampEnd = startTime + (speedRamp.durationSeconds * .8);
      const gainRampLengthSeconds = (speedRamp.durationSeconds * .4);
      const gainRampStart = gainRampEnd - gainRampLengthSeconds;
      if (newPlayState !== undefined) {
        void this.rampGainAtTime(endGain, gainRampStart, gainRampEnd);
      };
    };

    let zeroTime = startTime;

    if (newTransportDirection !== undefined) {
      let turnaroundChunkIndex = startChunkIndex;

      if (startSpeed > this.#playbackSpeeds.min) { // was already playing, need to ramp down
        let speedRampDown;
        const speedRampDownLengthSeconds = this.calcSpeedRampDuration(startSpeed, this.#playbackSpeeds.min)
        if (newTransportDirection === 1) {
          speedRampDown = this.getReverseSpeedRampChunks(startChunkIndex, speedRampDownLengthSeconds, startSpeed, this.#playbackSpeeds.min);
        } else if (newTransportDirection === -1) {
          speedRampDown = this.getSpeedRampChunks(startChunkIndex, speedRampDownLengthSeconds, startSpeed, this.#playbackSpeeds.min);
        };
        turnaroundChunkIndex = speedRampDown.rampChunks.pop().id;
        speedRampChunks.push(...speedRampDown.rampChunks);
        speedRampChunks.forEach(chunk => chunk.REQD === true);
        zeroTime += speedRampDown.durationSeconds;
        const gainRampDownEnd = startTime + (speedRampDown.durationSeconds * .8);
        const gainRampDownLengthSeconds = (speedRampDown.durationSeconds * .4);
        const gainRampDownStart = gainRampDownEnd - gainRampDownLengthSeconds;
        void this.rampGainAtTime(0, gainRampDownStart, gainRampDownEnd);
      };

      let speedRampUp;
      const speedRampUpLengthSeconds = this.calcSpeedRampDuration(this.#playbackSpeeds.min, endSpeed);
      if (newTransportDirection === 1) {
        speedRampUp = this.getSpeedRampChunks(turnaroundChunkIndex, speedRampUpLengthSeconds, this.#playbackSpeeds.min, endSpeed);
      } else if (newTransportDirection === -1) {
        speedRampUp = this.getReverseSpeedRampChunks(turnaroundChunkIndex, speedRampUpLengthSeconds, this.#playbackSpeeds.min, endSpeed);
      };
      endChunkIndex = speedRampUp.endChunkIndex;
      speedRampChunks.push(...speedRampUp.rampChunks);
      const gainRampUpEnd = zeroTime + (speedRampUp.durationSeconds * .8);
      const gainRampUpLengthSeconds = (speedRampUp.durationSeconds * .4);
      const gainRampUpStart = gainRampUpEnd - gainRampUpLengthSeconds;
      void this.rampGainAtTime(endGain, gainRampUpStart, gainRampUpEnd, false);

      this.#transportDirection = newTransportDirection;
    };

    void this.scheduleChunks(speedRampChunks, startTime);

    this.#transportSpeed = endSpeed;

    if (newPlayState === 0) {
      this.#resumeChunk = endChunkIndex;
    } else {
      void this.refillQueue();
    };

    while (this.#ctx.currentTime < zeroTime) {
      await this.constructor.sleep(32);
    };

    if (this.#playState < 0) {
      this.#playState = newPlayState;
    };

    if (this.#scrubState < 0) {
      this.#scrubState = newScrubState;
    };
  };



/* ------------------------------------------------------------------ */
/* Transport public methods */

  async play() {
    this.#transportQueue.push({
      playState: 1,
      scrubState: 0,
      transportDirection: 1,
      id: 'play',
    });
    this.requestTransport();
  };

  async stop() {
    this.#transportQueue.push({
      playState: 0,
      scrubState: 0,
      transportDirection: 1,
      id: 'stop',
    });
    this.requestTransport();
  };

  async rew_start() {
    this.#transportQueue.push({
      playState: 1,
      scrubState: 1,
      transportDirection: -1,
      id: 'rew_start'
    });
    this.requestTransport();
  };

  async rew_stop() {
    this.#transportQueue.push({
      playState: 1,
      scrubState: 0,
      transportDirection: 1,
      id: 'rew_stop'
    });
    this.requestTransport();
  };

  async ff_start() {
    this.#transportQueue.push({
      playState: 1,
      scrubState: 1,
      transportDirection: 1,
      id: 'ff_start'
    });
    this.requestTransport();
  };

  async ff_stop() {
    this.#transportQueue.push({
      playState: 1,
      scrubState: 0,
      transportDirection: 1,
      id: 'ff_stop'
    });
    this.requestTransport();
  };


};
