export default class Player {

/* ------------------------------------------------------------------ */
/* Private fields */

  #ctx;
  #masterGain;
  #bufferGain;
  #sampleRate;
  #rampChunkSamples;
  #chunkSamples;
  #lookaheadSeconds
  #scheduledSeconds;
  #pendingSeconds;
  #uiLatency;
  #playbackSpeeds;
  #state;
  #scheduledQueue;
  #pendingQueue;
  #tickInterval;
  #tickTimeout;
  #tickCb;
  #Loader;
  #totalSamples;
  #totalSeconds;



/* ------------------------------------------------------------------ */
/* Static Properties */

  // default constructor argument parameter values
  static DEFAULT_SAMPLE_RATE = 48e3;
  static DEFAULT_CHUNK_LENGTH = .02;
  static DEFAULT_LOOKAHEAD = 5;
  static DEFAULT_LATENCY = .1;
  static DEFAULT_PLAYBACK_SPEED = 1;
  static DEFAULT_SCRUB_SPEED = 8;

  // minimum parameter values
  static MIN_LOOKAHEAD_SECONDS = 1;
  static MIN_SCHEDULED_SECONDS = .1;
  static MIN_PLAYBACK_SPEED = .1;

  // chunk sample size constants
  static KBIN_SAMPLES = 128;
  static MIN_RAMP_CHUNK_KBINS = 4;

  // pre-defined parameter objects for transport state changes
  static TRANSPORT = {
    play: {
      playing: 1,
      scrubbing: 0,
      direction: 1,
    },
    stop: {
      playing: 0,
      scrubbing: 0,
      direction: 1,
    },
    rev: {
      playing: 1,
      scrubbing: 0,
      direction: -1,
    },
    ff: {
      playing: 1,
      scrubbing: 1,
      direction: 1,
    },
    rew: {
      playing: 1,
      scrubbing: 1,
      direction: -1,
    },
  };



/* ------------------------------------------------------------------ */
/* Static Methods */

  static calcRampChunkSamples(sampleRate, targetRampChunkSeconds) {
    const targetRampChunkSamples = Math.floor(sampleRate * targetRampChunkSeconds);
    const targetRampChunkKBins = Math.round(targetRampChunkSamples / this.KBIN_SAMPLES);
    const rampChunkKBins = Math.max(this.MIN_RAMP_CHUNK_KBINS, targetRampChunkKBins);
    const rampChunkSamples = (rampChunkKBins * this.KBIN_SAMPLES);
    return rampChunkSamples;
  };

  static clampMinValidNumber(val, minVal) {
    if (typeof val === 'number' && val >= minVal) {
      return val;
    };
    return minVal;
  };

  static calcRampDuration(startSpeed, endSpeed) {
    return Math.sqrt(Math.abs(startSpeed - endSpeed));
  };

  static parseLoadSrc(src) {
    if (Array.isArray(src)) {
      if (!src.every(url => typeof url === 'string')) {
        throw new TypeError('Source URLs must be strings');
      };
      return src;
    };
    if (typeof src === 'string') {
      return [src];
    };
    return [];
  };



/* ------------------------------------------------------------------ */
/* Getters */

  get sampleRate() {
    return this.#sampleRate;
  };

  get active() {
    return this._ctxActive && this._engineActive;
  };

  get totalSeconds() {
    return this.#totalSeconds;
  };

  get playhead() {
    if (!this.#scheduledQueue.length) {
      return this.#state.resumeSample / this.#sampleRate;
    };
    const nowChunk = this.#scheduledQueue[0];
    const elapsedSeconds = (
      (this.#ctx.currentTime - nowChunk.ctxStartTime)
      * (nowChunk.ctxPlaybackSpeed * nowChunk.direction)
    );
    return nowChunk.srcStartSeconds + elapsedSeconds;
  };

  get lookahead() {
    return this.#lookaheadSeconds;
  };

  get latency() {
    return this.#scheduledSeconds;
  };

  get playbackSpeed() {
    return this.#playbackSpeeds.base;
  };

  get scrubSpeed() {
    return this.#playbackSpeeds.scrub;
  };

  get volume() {
    return this.#masterGain.gain.value;
  };



/* ------------------------------------------------------------------ */
/* Private Getters */

  get _ctxActive() {
    return this.#ctx.state === 'running';
  };

  get _engineActive() {
    return !!this.#tickTimeout;
  };

  get _lastScheduledChunk() {
    return this.#scheduledQueue[this.#scheduledQueue.length - 1];
  };

  get _gainNode() {
    return this.#masterGain;
  };



/* ------------------------------------------------------------------ */
/* Setters */

  set lookahead(seconds) {
    this.#lookaheadSeconds = this.constructor.clampMinValidNumber(seconds, this.constructor.MIN_LOOKAHEAD_SECONDS);
    this.#pendingSeconds = (this.#lookaheadSeconds - this.#scheduledSeconds);
  };

  set latency(seconds) {
    this.#scheduledSeconds = this.constructor.clampMinValidNumber(seconds, this.constructor.MIN_SCHEDULED_SECONDS);
    this.#pendingSeconds = (this.#lookaheadSeconds - this.#scheduledSeconds);
    this.#uiLatency = (this.#scheduledSeconds / 5);
  };

  set playbackSpeed(speed) {
    this.#playbackSpeeds.base = this._clampSpeed(speed);
    if (!this.#state.busy && !this.#state.scrubbing && this.#state.playing) {
      if (this.#state.direction === 1) {
        this._transport_setState({ delta: true, ...this.constructor.TRANSPORT.play});
      };
      if (this.#state.direction === -1) {
        this._transport_setState({ delta: true, ...this.constructor.TRANSPORT.rev});
      };
    };
  };

  set scrubSpeed(speed) {
    this.#playbackSpeeds.scrub = this._clampSpeed(speed);
    if (!this.#state.busy && this.#state.scrubbing && this.#state.playing) {
      if (this.#state.direction === 1) {
        this._transport_setState({ delta: true, ...this.constructor.TRANSPORT.ff});
      };
      if (this.#state.direction === -1) {
        this._transport_setState({ delta: true, ...this.constructor.TRANSPORT.rew});
      };
    };
  };

  set volume(val) {
    const safeVal = this.constructor.clampMinValidNumber(val, 0);
    const now = this.#ctx.currentTime;
    const rampEnd = now + this.#uiLatency;
    this.#masterGain.gain.cancelScheduledValues(now);
    this.#masterGain.gain.linearRampToValueAtTime(safeVal, rampEnd);
  };



/* ------------------------------------------------------------------ */
/* Constructor */

  constructor({
    /* fixed at instantiation */
    sampleRate = this.constructor.DEFAULT_SAMPLE_RATE,
    chunkLength = this.constructor.DEFAULT_CHUNK_LENGTH,
    /* can change via setters */
    lookahead = this.constructor.DEFAULT_LOOKAHEAD,
    latency = this.constructor.DEFAULT_LATENCY,
    playbackSpeed = this.constructor.DEFAULT_PLAYBACK_SPEED,
    scrubSpeed = this.constructor.DEFAULT_SCRUB_SPEED,
    Loader,
  } = {}) {
    this.#ctx = new AudioContext({ sampleRate });
    // GainNode instantiation
    this.#masterGain = this.#ctx.createGain();
    this.#masterGain.connect(this.#ctx.destination);
    this.#masterGain.gain.value = 1;
    this.#bufferGain = this.#ctx.createGain();
    this.#bufferGain.connect(this.#masterGain);
    this.#bufferGain.gain.value = 0;
    // Engine timing constants
    this.#sampleRate = this.#ctx.sampleRate;
    this.#rampChunkSamples = this.constructor.calcRampChunkSamples(this.#sampleRate, chunkLength);
    this.#chunkSamples = this.#rampChunkSamples * 2;
    this.#lookaheadSeconds = this.constructor.clampMinValidNumber(lookahead, this.constructor.MIN_LOOKAHEAD_SECONDS);
    this.#scheduledSeconds = this.constructor.clampMinValidNumber(latency, this.constructor.MIN_SCHEDULED_SECONDS);
    this.#pendingSeconds = (this.#lookaheadSeconds - this.#scheduledSeconds);
    this.#uiLatency = (this.#scheduledSeconds / 5);
    this.#playbackSpeeds = {
      base: this._clampSpeed(playbackSpeed),
      min: this._clampSpeed(this.constructor.MIN_PLAYBACK_SPEED),
      scrub: this._clampSpeed(scrubSpeed),
    };
    // Engine state
    this.#state = {
      resumeSample: 0,
      playing: 0,
      scrubbing: 0,
      direction: 1,
      busy: false,
    };
    // Engine queues
    this.#scheduledQueue = [];
    this.#pendingQueue = [];
    // Engine runtime
    this.#tickInterval = (this.#rampChunkSamples / this.#sampleRate) * 1e3;
    this.#tickTimeout = null;
    this.#tickCb = this._tick.bind(this);
    // Loader + metadata
    this.#Loader = new Loader(this.#sampleRate);
    this.#totalSamples = 0;
    this.#totalSeconds = 0;
    // Public engine methods
    this.load = this._load.bind(this);
    this.activate = this._activate.bind(this);
    this.deactivate = this._deactivate.bind(this);
    // Public transport methods
    this.play = this._play.bind(this);
    this.stop = this._stop.bind(this);
    this.rev = this._rev.bind(this);
    this.ff = this._ff.bind(this);
    this.rew = this._rew.bind(this);
  };



/* ------------------------------------------------------------------ */
/* Public Engine Methods */

  async _load(src, ...args) {
    const safeSrc = this.constructor.parseLoadSrc(src);
    this.#totalSamples = await this.#Loader.load(safeSrc, ...args);
    this.#totalSeconds = this.#totalSamples / this.#sampleRate;
    return true;
  };

  _activate() {
    if (!this._ctxActive) {
      this.#ctx.resume();
    };
    if (!this._engineActive) {
      this.#tickCb();
    };
  };

  _deactivate() {
    if (this._ctxActive) {
      this.#ctx.suspend();
    };
    if (this._engineActive) {
      clearTimeout(this.#tickTimeout);
    };
  };



/* ------------------------------------------------------------------ */
/* Public Transport Methods */

  async _play() {
    await this._transport_setState(this.constructor.TRANSPORT.play);
    return true;
  };

  async _stop() {
    await this._transport_setState(this.constructor.TRANSPORT.stop);
    return true;
  };

  async _rev() {
    await this._transport_setState(this.constructor.TRANSPORT.rev);
    return true;
  };

  async _ff() {
    await this._transport_setState(this.constructor.TRANSPORT.ff);
    return true;
  };

  async _rew() {
    await this._transport_setState(this.constructor.TRANSPORT.rew);
    return true;
  };



/* ------------------------------------------------------------------ */
/* Engine Tick Callback */

  async _tick() {
    await this._queue_tick();
    this.#tickTimeout = setTimeout(this.#tickCb, this.#tickInterval);
  };



/* ------------------------------------------------------------------ */
/* Queue Scheduling + Helpers  */

/* queue runtime */
  async _queue_tick() {
    if (this.#state.busy) return null;
    const currentTime = this.#ctx.currentTime;
    this._queue_clearScheduledHead(currentTime);
    this._queue_schedulePendingChunks(currentTime);
    if (this.#state.playing === 1) {
      await this._queue_refillPendingChunks();
    };
  };


/* remove chunks that have finished playing from top of scheduled queue */
  _queue_clearScheduledHead(ctxTime) {
    if (!this.#scheduledQueue.length) return null;
    let currentScheduledChunk = this.#scheduledQueue[0];
    let nextStartTime = currentScheduledChunk.ctxNextStartTime;
    while (nextStartTime < ctxTime) {
      this.#state.resumeSample = currentScheduledChunk.srcEndSample;
      this.#scheduledQueue.shift();
      currentScheduledChunk = this.#scheduledQueue[0];
      if (!currentScheduledChunk) break;
      nextStartTime = currentScheduledChunk.ctxNextStartTime;
    };
  };


/* schedule chunk for playback and assign values to returned chunk object */
  _queue_scheduleChunk(chunk = {}, startTime = 0) {
    chunk.node.buffer = chunk.buffer;
    chunk.node.playbackRate.value = chunk.ctxPlaybackSpeed;
    chunk.ctxStartTime = this._clampClock(startTime);
    chunk.ctxLengthSeconds = (
      (chunk.srcLengthSamples / this.#sampleRate) / chunk.node.playbackRate.value
    );
    chunk.ctxNextStartTime = chunk.ctxStartTime + chunk.ctxLengthSeconds;
    chunk.node.connect(this.#bufferGain);
    chunk.node.start(chunk.ctxStartTime, 0);
    return chunk;
  };


/* schedule gain change */
  _queue_scheduleGain(ctxEndTime, targetVal) {
    this.#bufferGain.gain.linearRampToValueAtTime(targetVal, ctxEndTime);
  };


/* schedule chunks and shift from pending to scheduled */
  _queue_schedulePendingChunks(ctxTime) {
    if (!this.#pendingQueue.length) return null;
    const scheduledChunksFillTarget = ctxTime + this.#scheduledSeconds;
    let lastScheduledChunk = this._lastScheduledChunk;
    let lastCtxGain = lastScheduledChunk?.ctxGain ?? 0;
    let nextStartTime = lastScheduledChunk?.ctxNextStartTime ?? (ctxTime + this.#uiLatency);
    while (nextStartTime < scheduledChunksFillTarget) {
      const nextChunk = this.#pendingQueue.shift();
      if (!nextChunk) break;
      lastScheduledChunk = this._queue_scheduleChunk(nextChunk, nextStartTime);
      this.#scheduledQueue.push(lastScheduledChunk);
      if (lastCtxGain !== lastScheduledChunk.ctxGain) {
        this._queue_scheduleGain(lastScheduledChunk.ctxNextStartTime, lastScheduledChunk.ctxGain);
      };
      nextStartTime = lastScheduledChunk.ctxNextStartTime;
      lastCtxGain = lastScheduledChunk.ctxGain;
    };
  };


/* repopulate pending queue with new chunks */
  async _queue_refillPendingChunks() {
    const lastScheduledEndSample = this._lastScheduledChunk?.srcEndSample;
    const lastPendingChunk = this.#pendingQueue[this.#pendingQueue.length - 1];
    if (!lastScheduledEndSample || !lastPendingChunk) return null;
    const direction = lastPendingChunk.direction;
    const pendingChunksFillTarget = lastScheduledEndSample + (direction * this.#pendingSeconds * this.#sampleRate);
    const speed = lastPendingChunk.ctxPlaybackSpeed;
    const test = (direction < 0)
      ? () => (nextStartSample > pendingChunksFillTarget)
      : () => (nextStartSample < pendingChunksFillTarget);
    let nextChunk = lastPendingChunk;
    let nextStartSample = nextChunk.srcEndSample;
    while (test()) {
      const startSample = nextStartSample;
      nextStartSample += this.#chunkSamples * direction;
      nextChunk = await this._chunk_create(startSample, nextStartSample, speed);
      if (!nextChunk) break;
      this.#pendingQueue.push(nextChunk);
    };
  };


/* depopulate pending queue */
  _queue_clearPending() {
    this.#pendingQueue.splice(0, this.#pendingQueue.length);
  };



/* ------------------------------------------------------------------ */
/* Chunk Creation + Helpers  */

/* create new playback chunk object and populate buffer with sample data */
  async _chunk_create(startSample, endSample, speed, gain = 1) {
    try {
      const clamped = this._chunk_validateSampleRange(startSample, endSample);
      if (!clamped) return null;
      const buffer = await this._chunk_getBuffer(clamped.start, clamped.end);
      return {
        node: this.#ctx.createBufferSource(),
        buffer: buffer,
        direction: (clamped.start < clamped.end) ? 1 : -1,
        srcStartSeconds: clamped.start / this.#sampleRate,
        srcStartSample: clamped.start,
        srcEndSample: clamped.end,
        srcLengthSamples: clamped.srcLengthSamples,
        ctxPlaybackSpeed: speed,
        ctxStartTime: null,
        ctxNextStartTime: null,
        ctxLengthSeconds: null,
        ctxGain: gain,
      };
    } catch (err) {
      console.error('_chunk_create', err);
      return null;
    };
  };


/* clamp start + end sample values to valid integers and get total sample length */
  _chunk_validateSampleRange(startSample, endSample) {
    const start = this._clampSample(startSample);
    const end = this._clampSample(endSample);
    const srcLengthSamples = Math.abs(end - start);
    if (!srcLengthSamples) return null;
    return {
      start,
      end,
      srcLengthSamples,
    };
  };


/* create new buffer and populate with sample data from specified range */
  async _chunk_getBuffer(startSample, endSample) {
    let buffer;
    if (endSample < startSample) {
      buffer = this.#ctx.createBuffer(2, startSample - endSample, this.#sampleRate);
      buffer.copyToChannel(await this.#Loader.getReverseSampleDataByChannel(0, endSample, startSample), 0, 0);
      buffer.copyToChannel(await this.#Loader.getReverseSampleDataByChannel(1, endSample, startSample), 1, 0);
    } else {
      buffer = this.#ctx.createBuffer(2, endSample - startSample, this.#sampleRate);
      buffer.copyToChannel(await this.#Loader.getSampleDataByChannel(0, startSample, endSample), 0, 0);
      buffer.copyToChannel(await this.#Loader.getSampleDataByChannel(1, startSample, endSample), 1, 0);
    };
    return buffer;
  };



/* ------------------------------------------------------------------ */
/* Transport State Management + Helpers */

  async _transport_setState(nextState = {}) {
    const validNextState = this._transport_validateNextState(nextState);
    if (!validNextState) return null;
    await this._transport_awaitBusyState();
    this.#state.busy = true;
    await this._transport_scheduleDeltaChunks(validNextState);
    this._transport_applyNextState(validNextState);
    this.#state.busy = false;
  };


  async _transport_awaitBusyState() {
    while (this.#state.busy === true) {
      await new Promise(res => setTimeout(res, 16));
    };
    return true;
  };


/* validate nextState object and return null if invalid */
  _transport_validateNextState(nextState = {}) {
    const nextDirection = nextState?.direction;
    switch (true) {
      // no state change, abort
      case Object.entries(nextState).every(([key, val]) => this.#state[key] === val):
        return null;
      // attempting to play reverse past zero, abort
      case ((this.#state.resumeSample <= 0) && (nextDirection !== 1)):
        return null;
      // attempting to play past the end, abort
      case ((this.#state.resumeSample >= this.#totalSamples) && (nextDirection !== -1)):
        return null;
      // valid nextState, return nextState params object
      default:
        return {
          nextDirection,
          nextPlaying: nextState?.playing,
          nextScrubbing: nextState?.scrubbing,
        };
    };
  };


/* assign nextState values to state */
  _transport_applyNextState(nextState = {}) {
    this.#state.direction = nextState.nextDirection;
    this.#state.scrubbing = nextState.nextScrubbing;
    this.#state.playing = nextState.nextPlaying;
  };


/* clear pending queue and populate with ramp chunks transitioning to new state */
  async _transport_scheduleDeltaChunks({
    nextDirection,
    nextPlaying,
    nextScrubbing,
  } = {}) {
    this._queue_clearPending();
    const {
      startSpeed,
      startDirection,
      srcStartSample,
    } = this._transport_getInitParams();
    const endSpeed = this._transport_calcEndSpeed(nextPlaying, nextScrubbing);
    if (nextDirection === startDirection) {   // change speed in same direction
      await this._transport_pushRamp({
        startSpeed: startSpeed,
        endSpeed: endSpeed,
        srcStartSample: srcStartSample,
        direction: nextDirection,
        ignoreGain: (startSpeed !== this.#playbackSpeeds.min) && (endSpeed !== this.#playbackSpeeds.min),
      });
    } else {    // change directions
      const midSample = await this._transport_pushRamp({
        startSpeed: startSpeed,
        endSpeed: this.#playbackSpeeds.min,
        srcStartSample: srcStartSample,
        direction: startDirection,
      });
      await this._transport_pushRamp({
        startSpeed: this.#playbackSpeeds.min,
        endSpeed: endSpeed,
        srcStartSample: midSample ? midSample : srcStartSample,
        direction: nextDirection,
      });
    };
  };


  _transport_getInitParams() {
    const lastScheduledChunk = this._lastScheduledChunk;
    return {
      startSpeed: lastScheduledChunk?.ctxPlaybackSpeed ?? this.#playbackSpeeds.min,
      startDirection: lastScheduledChunk?.direction ?? this.#state.direction,
      srcStartSample: lastScheduledChunk?.srcEndSample ?? this.#state.resumeSample,
      ctxStartGain: lastScheduledChunk?.ctxGain ?? 0,
    };
  };


  _transport_calcEndSpeed(nextPlaying, nextScrubbing) {
    let endSpeed = this.#playbackSpeeds.min;
    if (nextPlaying === 1) {
      if (nextScrubbing === 1) {
        endSpeed = this.#playbackSpeeds.scrub;
      };
      if (nextScrubbing === 0) {
        endSpeed = this.#playbackSpeeds.base;
      };
    };
    return endSpeed;
  };


  async _transport_pushRamp({
    startSpeed,
    endSpeed,
    srcStartSample,
    direction = 1,
    ignoreGain = false,
  } = {}) {
    const rampChunkParams = this._transport_calcRampChunkParams(startSpeed, endSpeed);
    let nextStartSample = srcStartSample;
    while (rampChunkParams.length) {
      const startSample = nextStartSample;
      const { lengthSrcSamples, speed, gain } = rampChunkParams.shift();
      nextStartSample += lengthSrcSamples * direction;
      const chunk = await this._chunk_create(startSample, nextStartSample, speed);
      if (!chunk) break;
      if (!ignoreGain) {
        chunk.ctxGain = gain;
      };
      this.#pendingQueue.push(chunk);
      if (!rampChunkParams.length) {
        return chunk.srcEndSample;
      };
    };
  };


  _transport_calcRampChunkParams(startSpeed, endSpeed) {
    const speedStep = this._transport_calcRampSpeedStep(startSpeed, endSpeed);
    const rampChunkParams = [];
    let nextSpeed = startSpeed;
    while (true) {
      const speed = this._clampSpeed(nextSpeed);
      const gain = Math.max(0, Math.min(1, speed - this.#playbackSpeeds.min));
      const lengthSrcSamples = this.#rampChunkSamples * speed;
      rampChunkParams.push({ speed, lengthSrcSamples, gain });
      if (speed === endSpeed) break;
      if (Math.abs(endSpeed - nextSpeed) < Math.abs(speedStep)) {
        nextSpeed = endSpeed;
        continue;
      };
      nextSpeed += speedStep;
    };
    return rampChunkParams;
  };


  _transport_calcRampSpeedStep(startSpeed, endSpeed) {
    const lengthSeconds = this.constructor.calcRampDuration(startSpeed, endSpeed);
    const lengthSamples = lengthSeconds * this.#sampleRate;
    const lengthRampChunks = Math.floor(lengthSamples / this.#rampChunkSamples);
    const speedDelta = endSpeed - startSpeed;
    return speedDelta / lengthRampChunks;
  };



/* ------------------------------------------------------------------ */
/* Misc Helpers */

/* clamp seconds value to whole-sample equivalent float */
  _clampClock(seconds) {
    const timeSamples = seconds * this.#sampleRate;
    const timeSamplesWhole = Math.round(timeSamples);
    return timeSamplesWhole / this.#sampleRate;
  };


/* clamp speed value to whole-sample equivalent float */
  _clampSpeed(speed) {
    const safeSpeed = this.constructor.clampMinValidNumber(speed, this.constructor.MIN_PLAYBACK_SPEED);
    const srcChunkSamples = this.#rampChunkSamples * safeSpeed;
    const targetSrcChunkSamples = Math.round(srcChunkSamples);
    const targetSpeed = (targetSrcChunkSamples / this.#rampChunkSamples);
    return targetSpeed;
  };


/* clamp arbitrary sample value to integer within available range */
  _clampSample(sample) {
    if (sample < 0) {
      return 0;
    };
    if (sample >= this.#totalSamples) {
      return this.#totalSamples;
    };
    return parseInt(sample, 10);
  };



};
