import { Loader } from './';





export default class Player {

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
    return this._ctx.state === 'running';
  };

  get buffered() {
    return !!this._totalSamples;
  };

  get totalLength() {
    return this._totalSamples / this._sampleRate;
  };

  get transportBusy() {
    return (this._playState === -1) || (this._scrubState === -1) || !this._transportDirection;
  };

  get playing() {
    return (this._playState !== 0) || this.transportBusy;
  };

  get playhead() {
    const now = this._ctx.currentTime;
    const nowChunk = this._scheduleQueue.find(c => (
      (c.startTime < now) && ((c.startTime + c.playSeconds) > now)
    ));
    if (!nowChunk) {
      return this._resumeChunk * this._chunkSeconds;
    };
    const baseStartTime = nowChunk.id * this._chunkSeconds;
    const elapsedTime = this._ctx.currentTime - nowChunk.startTime;
    const baseElapsedTime = elapsedTime * nowChunk.node.playbackRate.value;
    return baseStartTime + (baseElapsedTime * this._transportDirection);
  };

  get lookahead() {
    return this._lookaheadSeconds;
  };

  get latency() {
    return this._uiLatency;
  };



/* ------------------------------------------------------------------ */
/* Setters */

  set lookahead(seconds) {
    this._lookaheadSeconds = this.constructor.clampValidNumber(seconds, 10);
  };

  set latency(seconds) {
    this._uiLatency = this.constructor.clampValidNumber(seconds, .01);
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
    this._ctx = new AudioContext({ sampleRate });
    this._sampleRate = this._ctx.sampleRate;
    this._rampChunkSamples = this.constructor.calcRampChunkSamples(this._sampleRate, chunkSeconds);
    this._chunkSamples = this._rampChunkSamples * 2;
    this._chunkSeconds = this._chunkSamples / this._sampleRate;
    this._totalSamples = 0;
    this._totalChunks = 0;
    this._Loader = new Loader(this._sampleRate, this._chunkSamples);
    this._lookaheadSeconds = this.constructor.clampValidNumber(lookahead, 10);
    this._uiLatency = this.constructor.clampValidNumber(latency, .01);
    this._playbackSpeeds = {
      min: .01,
      base: playbackSpeed,
      scrub: scrubSpeed,
    };
    this._resumeChunk = 0;
    this._scheduleQueue = [];
    this._transportQueue = [];
    this._playState = 0;            /* -1 = pending; 0 = stopped; 1 = playing; */
    this._scrubState = 0;           /* -1 = pending; 0 = normal; 1 = ff; */
    this._transportDirection = 1;   /* -1 = reverse; 0 = pending; 1 = forward; */
    this._transportSpeed = this._playbackSpeeds.min;
    this._masterGain = this._ctx.createGain();
    this._masterGain.connect(this._ctx.destination);
    this._masterGain.gain.value = 1;
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
      this._ctx.resume();
    };
  };


  async load(filePaths, cb = null) {
    if (this.playing) {
      // console.warn('LOAD --- cannot load while playing');
      return null;
    };

    let pending = undefined;
    try {
      const loadPromise = this._Loader.load(filePaths);
      if (cb) {
        let p = 0;
        pending = p < 1;
        while(pending === true) {
          const nextP = this._Loader.progress;
          if (nextP !== p) {
            p = nextP;
            pending = p < 1;
            cb(p);
            if (p >= 1) break;
          };
          await this.constructor.sleep(32);
        };
      };
      this._totalSamples = await loadPromise;
      this._totalChunks = this._totalSamples / this._chunkSamples;
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
    const startSample = chunkIndex * this._chunkSamples;
    const endSample = (chunkIndex + 1) * this._chunkSamples;
    const buffer = this._ctx.createBuffer(2, this._chunkSamples, this._sampleRate);
    if (this._transportDirection < 0) {
      buffer.copyToChannel(this._Loader.getReverseSampleDataByChannel(0, startSample, endSample), 0, 0);
      buffer.copyToChannel(this._Loader.getReverseSampleDataByChannel(1, startSample, endSample), 1, 0);
    } else {
      buffer.copyToChannel(this._Loader.getSampleDataByChannel(0, startSample, endSample), 0, 0);
      buffer.copyToChannel(this._Loader.getSampleDataByChannel(1, startSample, endSample), 1, 0);
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
    const timeSamples = time * this._sampleRate;
    const timeSamplesInt = Math.round(timeSamples);
    const timeSeconds = timeSamplesInt / this._sampleRate;
    return timeSeconds;
  };


  scheduleChunk(chunk) {
    chunk.node.start(chunk.startTime, 0);
    this._scheduleQueue.push(chunk);
  };


  scheduleChunks(chunks, start) {
    let nextStartTime = this.clampClock(start);
    chunks.forEach(chunk => {
      chunk.startTime = nextStartTime;
      chunk.playSeconds = (chunk.node.buffer.length / this._sampleRate) / chunk.node.playbackRate.value;
      nextStartTime += chunk.playSeconds;
      void this.scheduleChunk(chunk);
    });
  };


  cancelChunksAfter(startTime) {
    this._scheduleQueue.forEach((q, qi) => {
      q.node.onended = null;
      if (q.startTime >= startTime) {
        q.node.disconnect(this._masterGain);
        q.node.stop();
      };
    });
    const spliceIndexStart = this._scheduleQueue
      .findIndex(q => q.startTime >= startTime);
    this._scheduleQueue.splice(spliceIndexStart);
  };


  refillQueue() {
    const endTime = this._ctx.currentTime + this.lookahead;
    let lastChunk = this._scheduleQueue[this._scheduleQueue.length - 1];
    if (!lastChunk) {
      // console.warn('REFILL QUEUE --- no last chunk');
      return null;
    };

    while (lastChunk.startTime < endTime) {
      const nextStartTime = lastChunk.startTime + lastChunk.playSeconds;
      let nextChunkIndex = lastChunk.id + this._transportDirection;
      if (Math.floor(nextChunkIndex) !== nextChunkIndex) {
        const lastSampleLength = lastChunk.node.buffer.length;
        const nextSampleStart = lastChunk.startSample + (lastSampleLength * this._transportDirection);
        nextChunkIndex = nextSampleStart / this._chunkSamples;
      };
      if (nextChunkIndex >= this._totalChunks) {
        // console.warn('REFILL QUEUE --- next chunk after range')
        return null;
      };
      if (nextChunkIndex < 0) {
        // console.warn('REFILL QUEUE --- next chunk before range')
        return null;
      };
      const nextChunk = this.getChunk(nextChunkIndex);
      nextChunk.startTime = nextStartTime;
      nextChunk.playSeconds = (nextChunk.node.buffer.length / this._sampleRate) / nextChunk.node.playbackRate.value;
      void this.scheduleChunk(nextChunk);
      lastChunk = this._scheduleQueue[this._scheduleQueue.length - 1];
    };
  };


  checkSchedule(e) {
    e.target.removeEventListener('ended', this.checkSchedule);

    if (this._scheduleQueue.length < 2) {
      // console.warn('CHECK SCHEDULE --- not enough in queue');
      const lastChunk = this._scheduleQueue[0];
      if (lastChunk) {
        // console.log('setting resume chunk', lastChunk)
        this._resumeChunk = lastChunk.id;
        this._scheduleQueue.splice(0);
        this._playState = 0;
      };
      return null;
    };

    const now = this._ctx.currentTime;
    let nextStartTime = this._scheduleQueue[1].startTime;
    while (nextStartTime < now) {
      // this._scheduleQueue[0].node.onended = null;
      this._scheduleQueue[0].node.removeEventListener('ended', this.checkSchedule);
      this._scheduleQueue.shift();
      if (this._scheduleQueue.length < 2) break;
      nextStartTime = this._scheduleQueue[1].startTime;
    };

    if (this.transportBusy) {
      // console.log('CHECK SCHEDULE --- transport is busy');
      return null;
    };

    if (this._playState === 0) {
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
      node: this._ctx.createBufferSource(),
      startSample: chunkIndex * this._chunkSamples,
    };
    chunk.node.buffer = this.getBuffer(chunkIndex);
    chunk.node.playbackRate.value = this._transportSpeed;
    chunk.node.onended = this.checkSchedule;
    chunk.node.connect(this._masterGain);
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
    const lengthSamples = lengthSeconds * this._sampleRate;
    const lengthRampChunks = Math.floor(lengthSamples / this._rampChunkSamples);
    const speedRange = endSpeed - startSpeed;
    const speedStep = speedRange / lengthRampChunks;
    const rampChunkParams = new Array(lengthRampChunks).fill()
      .map((d, i) => {
        const speedApprox = startSpeed + (i * speedStep);
        const lengthSrcSamples = Math.round(this._rampChunkSamples * speedApprox);
        const speed = lengthSrcSamples / this._rampChunkSamples;
        return {
          lengthSrcSamples,
          speed,
        };
      });
    const lengthSrcSamples = rampChunkParams
      .reduce((acc, d) => acc += d.lengthSrcSamples, 0);
    const lengthChunks = Math.ceil(lengthSrcSamples / this._chunkSamples);
    const lengthTotalSamples = lengthChunks * this._chunkSamples;
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
    const durationSeconds = (lengthRampChunks *  this._rampChunkSamples) / this._sampleRate;
    return {
      rampChunkParams,
      lengthChunks,
      durationSeconds,
    };
  };


  genRampChunks(startChunkIndex, rampParams, reverse = false) {
    const { rampChunkParams, lengthChunks, durationSeconds } = rampParams;
    const endChunkIndex = startChunkIndex + (reverse ? -lengthChunks : lengthChunks);
    const rampStartSample = startChunkIndex * this._chunkSamples;
    if (rampStartSample < 0 || rampStartSample >= this._totalSamples) {
      // console.warn('GEN RAMP CHUNKS --- start out of bounds');
    };
    const rampEndSample = endChunkIndex * this._chunkSamples;
    if (rampEndSample < 0 || rampEndSample >= this._totalSamples) {
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
        id: startSample / this._chunkSamples,
        node: this._ctx.createBufferSource(),
        startSample: startSample,
      };
      chunk.node.buffer = this._ctx.createBuffer(2, r.lengthSrcSamples, this._sampleRate);
      if (reverse) {
        chunk.node.buffer.copyToChannel(this._Loader.getReverseSampleDataByChannel(0, nextStartSample, startSample), 0, 0);
        chunk.node.buffer.copyToChannel(this._Loader.getReverseSampleDataByChannel(1, nextStartSample, startSample), 1, 0);
      } else {
        chunk.node.buffer.copyToChannel(this._Loader.getSampleDataByChannel(0, startSample, nextStartSample), 0, 0);
        chunk.node.buffer.copyToChannel(this._Loader.getSampleDataByChannel(1, startSample, nextStartSample), 1, 0);
      };
      chunk.node.playbackRate.value = r.speed;
      chunk.node.onended = this.checkSchedule;
      chunk.node.connect(this._masterGain);
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
    const node = this._masterGain.gain;
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
    const minTimeTarget = targetTime || this._ctx.currentTime + this._uiLatency;
    const reqdChunks = this._scheduleQueue.filter(c => c.REQD === true);
    const minReqdTargetTime = (reqdChunks.length)
      ? reqdChunks[reqdChunks.length - 1]
      : minTimeTarget;
    const chunk = this._scheduleQueue.find(c => c.startTime >= minReqdTargetTime);
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
    if (this._transportQueue.length) {
      this._transportQueue.splice(1);
    } else {
      return null;
    };
    this.deltaTransport(this._transportQueue.pop());
  };


  async deltaTransport({ playState, scrubState, transportDirection, id } = {}) {
    const oldPlayState = this._playState;
    const oldScrubState = this._scrubState;
    const oldTransportDirection = this._transportDirection;
    let newPlayState;
    let newScrubState;
    let newTransportDirection;
    if ((playState !== undefined) && (playState !== oldPlayState)) {
      newPlayState = playState;
      this._playState = -1;
    };
    if ((scrubState !== undefined) && (scrubState !== oldScrubState)) {
      newScrubState = scrubState;
      this._scrubState = -1;
    };
    if ((transportDirection !== undefined) && (transportDirection !== oldTransportDirection)) {
      newTransportDirection = transportDirection;
      this._transportDirection = 0;
    };
    if (!this.transportBusy) return null;

    let startChunkIndex,
        startTime,
        startSpeed,
        endSpeed = this._playbackSpeeds.base,
        endGain = 1;

    const nextSafeChunk = this.getNextSafeChunk();
    if (!nextSafeChunk) {
      startChunkIndex = this._resumeChunk;
      startTime = this.clampClock(this._ctx.currentTime + this._uiLatency);
      startSpeed = this._playbackSpeeds.min;
    } else {
      startChunkIndex = nextSafeChunk.id;
      startTime = nextSafeChunk.startTime;
      startSpeed = nextSafeChunk.node.playbackRate.value;
      void this.cancelChunksAfter(startTime);
    };

    if (newPlayState !== undefined) {
      if (newPlayState === 0) {
        endSpeed = this._playbackSpeeds.min;
        endGain = 0;
      };
    };
    if (newScrubState !== undefined) {
      if (newScrubState === 1) {
        endSpeed = this._playbackSpeeds.scrub;
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

      if (startSpeed > this._playbackSpeeds.min) { // was already playing, need to ramp down
        let speedRampDown;
        const speedRampDownLengthSeconds = this.calcSpeedRampDuration(startSpeed, this._playbackSpeeds.min)
        if (newTransportDirection === 1) {
          speedRampDown = this.getReverseSpeedRampChunks(startChunkIndex, speedRampDownLengthSeconds, startSpeed, this._playbackSpeeds.min);
        } else if (newTransportDirection === -1) {
          speedRampDown = this.getSpeedRampChunks(startChunkIndex, speedRampDownLengthSeconds, startSpeed, this._playbackSpeeds.min);
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
      const speedRampUpLengthSeconds = this.calcSpeedRampDuration(this._playbackSpeeds.min, endSpeed);
      if (newTransportDirection === 1) {
        speedRampUp = this.getSpeedRampChunks(turnaroundChunkIndex, speedRampUpLengthSeconds, this._playbackSpeeds.min, endSpeed);
      } else if (newTransportDirection === -1) {
        speedRampUp = this.getReverseSpeedRampChunks(turnaroundChunkIndex, speedRampUpLengthSeconds, this._playbackSpeeds.min, endSpeed);
      };
      endChunkIndex = speedRampUp.endChunkIndex;
      speedRampChunks.push(...speedRampUp.rampChunks);
      const gainRampUpEnd = zeroTime + (speedRampUp.durationSeconds * .8);
      const gainRampUpLengthSeconds = (speedRampUp.durationSeconds * .4);
      const gainRampUpStart = gainRampUpEnd - gainRampUpLengthSeconds;
      void this.rampGainAtTime(endGain, gainRampUpStart, gainRampUpEnd, false);

      this._transportDirection = newTransportDirection;
    };

    void this.scheduleChunks(speedRampChunks, startTime);

    this._transportSpeed = endSpeed;

    if (newPlayState === 0) {
      this._resumeChunk = endChunkIndex;
    } else {
      void this.refillQueue();
    };

    while (this._ctx.currentTime < zeroTime) {
      await this.constructor.sleep(32);
    };

    if (this._playState < 0) {
      this._playState = newPlayState;
    };

    if (this._scrubState < 0) {
      this._scrubState = newScrubState;
    };
  };



/* ------------------------------------------------------------------ */
/* Transport public methods */

  async play() {
    this._transportQueue.push({
      playState: 1,
      scrubState: 0,
      transportDirection: 1,
      id: 'play',
    });
    this.requestTransport();
  };

  async stop() {
    this._transportQueue.push({
      playState: 0,
      scrubState: 0,
      transportDirection: 1,
      id: 'stop',
    });
    this.requestTransport();
  };

  async rew_start() {
    this._transportQueue.push({
      playState: 1,
      scrubState: 1,
      transportDirection: -1,
      id: 'rew_start'
    });
    this.requestTransport();
  };

  async rew_stop() {
    this._transportQueue.push({
      playState: 1,
      scrubState: 0,
      transportDirection: 1,
      id: 'rew_stop'
    });
    this.requestTransport();
  };

  async ff_start() {
    this._transportQueue.push({
      playState: 1,
      scrubState: 1,
      transportDirection: 1,
      id: 'ff_start'
    });
    this.requestTransport();
  };

  async ff_stop() {
    this._transportQueue.push({
      playState: 1,
      scrubState: 0,
      transportDirection: 1,
      id: 'ff_stop'
    });
    this.requestTransport();
  };


};
