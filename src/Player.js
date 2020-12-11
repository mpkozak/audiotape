export default class Player {

/* ------------------------------------------------------------------ */
/* Static Properties */

  // default constructor argument parameter values
  static DEFAULT_SAMPLE_RATE = 48e3;
  static DEFAULT_CHUNK_LENGTH = .02;
  static DEFAULT_LOOKAHEAD = 5;
  static DEFAULT_LATENCY = .1;
  static DEFAULT_PLAYBACK_SPEED = 1;
  static DEFAULT_SCRUB_SPEED = 5;

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
    return this._sampleRate;
  };

  get active() {
    return this._ctxActive && this._engineActive;
  };

  get totalSeconds() {
    return this._totalSeconds;
  };

  get playhead() {
    if (!this._scheduledQueue.length) {
      return this._state.resumeSample / this._sampleRate;
    };
    const nowChunk = this._scheduledQueue[0];
    const elapsedSeconds = (
      (this._ctx.currentTime - nowChunk.ctxStartTime)
      * (nowChunk.ctxPlaybackSpeed * nowChunk.direction)
    );
    return nowChunk.srcStartSeconds + elapsedSeconds;
  };

  get lookahead() {
    return this._lookaheadSeconds;
  };

  get latency() {
    return this._scheduledSeconds;
  };

  get playbackSpeed() {
    return this._playbackSpeeds.base;
  };

  get scrubSpeed() {
    return this._playbackSpeeds.scrub;
  };

  get volume() {
    return this._masterGain.gain.value;
  };



/* ------------------------------------------------------------------ */
/* Private Getters */

  get _ctxActive() {
    return this._ctx.state === 'running';
  };

  get _engineActive() {
    return !!this._tickTimeout;
  };

  get _lastScheduledChunk() {
    return this._scheduledQueue[this._scheduledQueue.length - 1];
  };

  get _gainNode() {
    return this._masterGain;
  };



/* ------------------------------------------------------------------ */
/* Setters */

  set lookahead(seconds) {
    this._lookaheadSeconds = this.constructor.clampMinValidNumber(seconds, this.constructor.MIN_LOOKAHEAD_SECONDS);
    this._pendingSeconds = (this._lookaheadSeconds - this._scheduledSeconds);
  };

  set latency(seconds) {
    this._scheduledSeconds = this.constructor.clampMinValidNumber(seconds, this.constructor.MIN_SCHEDULED_SECONDS);
    this._pendingSeconds = (this._lookaheadSeconds - this._scheduledSeconds);
    this._uiLatency = (this._scheduledSeconds / 5);
  };

  set playbackSpeed(speed) {
    this._playbackSpeeds.base = this._clampSpeed(speed);
    if (!this._state.busy && !this._state.scrubbing && this._state.playing) {
      if (this._state.direction === 1) {
        this._transport_setState({ delta: true, ...this.constructor.TRANSPORT.play});
      };
      if (this._state.direction === -1) {
        this._transport_setState({ delta: true, ...this.constructor.TRANSPORT.rev});
      };
    };
  };

  set scrubSpeed(speed) {
    this._playbackSpeeds.scrub = this._clampSpeed(speed);
    if (!this._state.busy && this._state.scrubbing && this._state.playing) {
      if (this._state.direction === 1) {
        this._transport_setState({ delta: true, ...this.constructor.TRANSPORT.ff});
      };
      if (this._state.direction === -1) {
        this._transport_setState({ delta: true, ...this.constructor.TRANSPORT.rew});
      };
    };
  };

  set volume(val) {
    const safeVal = this.constructor.clampMinValidNumber(val, 0);
    const now = this._ctx.currentTime;
    const rampEnd = now + this._uiLatency;
    this._masterGain.gain.cancelScheduledValues(now);
    this._masterGain.gain.linearRampToValueAtTime(safeVal, rampEnd);
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
    // AudioContext
    this._ctx = new AudioContext({ sampleRate });
    // GainNode instantiation
    this._masterGain = this._ctx.createGain();
    this._masterGain.connect(this._ctx.destination);
    this._masterGain.gain.value = 1;
    this._bufferGain = this._ctx.createGain();
    this._bufferGain.connect(this._masterGain);
    this._bufferGain.gain.value = 0;
    // Engine timing constants
    this._sampleRate = this._ctx.sampleRate;
    this._rampChunkSamples = this.constructor.calcRampChunkSamples(this._sampleRate, chunkLength);
    this._chunkSamples = this._rampChunkSamples * 2;
    this._lookaheadSeconds = this.constructor.clampMinValidNumber(lookahead, this.constructor.MIN_LOOKAHEAD_SECONDS);
    this._scheduledSeconds = this.constructor.clampMinValidNumber(latency, this.constructor.MIN_SCHEDULED_SECONDS);
    this._pendingSeconds = (this._lookaheadSeconds - this._scheduledSeconds);
    this._uiLatency = (this._scheduledSeconds / 5);
    this._playbackSpeeds = {
      base: this._clampSpeed(playbackSpeed),
      min: this._clampSpeed(this.constructor.MIN_PLAYBACK_SPEED),
      scrub: this._clampSpeed(scrubSpeed),
    };
    // Engine state
    this._state = {
      resumeSample: 0,
      playing: 0,
      scrubbing: 0,
      direction: 1,
      busy: false,
    };
    // Engine queues
    this._scheduledQueue = [];
    this._pendingQueue = [];
    // Engine runtime
    this._tickInterval = (this._rampChunkSamples / this._sampleRate) * 1e3;
    this._tickTimeout = null;
    this._tickCb = this._tick.bind(this);
    // Loader + metadata
    this._Loader = new Loader(this._sampleRate);
    this._totalSamples = 0;
    this._totalSeconds = 0;
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
    this._totalSamples = await this._Loader.load(safeSrc, ...args);
    this._totalSeconds = this._totalSamples / this._sampleRate;
    return true;
  };

  _activate() {
    if (!this._ctxActive) {
      this._ctx.resume();
    };
    if (!this._engineActive) {
      this._tickCb();
    };
  };

  _deactivate() {
    if (this._ctxActive) {
      this._ctx.suspend();
    };
    if (this._engineActive) {
      clearTimeout(this._tickTimeout);
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
    this._tickTimeout = setTimeout(this._tickCb, this._tickInterval);
  };



/* ------------------------------------------------------------------ */
/* Queue Scheduling + Helpers  */

/* queue runtime */
  async _queue_tick() {
    if (this._state.busy) return null;
    const currentTime = this._ctx.currentTime;
    this._queue_clearScheduledHead(currentTime);
    this._queue_schedulePendingChunks(currentTime);
    if (this._state.playing === 1) {
      await this._queue_refillPendingChunks();
    };
  };


/* remove chunks that have finished playing from top of scheduled queue */
  _queue_clearScheduledHead(ctxTime) {
    if (!this._scheduledQueue.length) return null;
    let currentScheduledChunk = this._scheduledQueue[0];
    let nextStartTime = currentScheduledChunk.ctxNextStartTime;
    while (nextStartTime < ctxTime) {
      this._state.resumeSample = currentScheduledChunk.srcEndSample;
      this._scheduledQueue.shift();
      currentScheduledChunk = this._scheduledQueue[0];
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
      (chunk.srcLengthSamples / this._sampleRate) / chunk.node.playbackRate.value
    );
    chunk.ctxNextStartTime = chunk.ctxStartTime + chunk.ctxLengthSeconds;
    chunk.node.connect(this._bufferGain);
    chunk.node.start(chunk.ctxStartTime, 0);
    return chunk;
  };


/* schedule gain change */
  _queue_scheduleGain(ctxEndTime, targetVal) {
    this._bufferGain.gain.linearRampToValueAtTime(targetVal, ctxEndTime);
  };


/* schedule chunks and shift from pending to scheduled */
  _queue_schedulePendingChunks(ctxTime) {
    if (!this._pendingQueue.length) return null;
    const scheduledChunksFillTarget = ctxTime + this._scheduledSeconds;
    let lastScheduledChunk = this._scheduledQueue[this._scheduledQueue.length - 1];
    let lastCtxGain = lastScheduledChunk?.ctxGain ?? 0;
    let nextStartTime = (
      lastScheduledChunk?.ctxNextStartTime
      ?? (ctxTime + this._uiLatency)
    );
    while (nextStartTime < scheduledChunksFillTarget) {
      const nextChunk = this._pendingQueue.shift();
      if (!nextChunk) break;
      lastScheduledChunk = this._queue_scheduleChunk(nextChunk, nextStartTime);
      this._scheduledQueue.push(lastScheduledChunk);
      if (lastCtxGain !== lastScheduledChunk.ctxGain) {
        this._queue_scheduleGain(lastScheduledChunk.ctxNextStartTime, lastScheduledChunk.ctxGain);
      };
      nextStartTime = lastScheduledChunk.ctxNextStartTime;
      lastCtxGain = lastScheduledChunk.ctxGain;
    };
  };


/* repopulate pending queue with new chunks */
  async _queue_refillPendingChunks() {
    const lastScheduledEndSample = this._scheduledQueue[this._scheduledQueue.length - 1]?.srcEndSample;
    const lastPendingChunk = this._pendingQueue[this._pendingQueue.length - 1];
    if (!lastScheduledEndSample || !lastPendingChunk) return null;
    const direction = lastPendingChunk.direction;
    const pendingChunksFillTarget = lastScheduledEndSample + (direction * this._pendingSeconds * this._sampleRate);
    const speed = lastPendingChunk.ctxPlaybackSpeed;
    const test = (direction < 0)
      ? () => (nextStartSample > pendingChunksFillTarget)
      : () => (nextStartSample < pendingChunksFillTarget);
    let nextChunk = lastPendingChunk;
    let nextStartSample = nextChunk.srcEndSample;
    while (test()) {
      const startSample = nextStartSample;
      nextStartSample += this._chunkSamples * direction;
      nextChunk = await this._chunk_create(startSample, nextStartSample, speed);
      if (!nextChunk) break;
      this._pendingQueue.push(nextChunk);
    };
  };


/* depopulate pending queue */
  _queue_clearPending() {
    this._pendingQueue.splice(0, this._pendingQueue.length);
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
        node: this._ctx.createBufferSource(),
        buffer: buffer,
        direction: (clamped.start < clamped.end) ? 1 : -1,
        srcStartSeconds: clamped.start / this._sampleRate,
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
      buffer = this._ctx.createBuffer(2, startSample - endSample, this._sampleRate);
      buffer.copyToChannel(await this._Loader.getReverseSampleDataByChannel(0, endSample, startSample), 0, 0);
      buffer.copyToChannel(await this._Loader.getReverseSampleDataByChannel(1, endSample, startSample), 1, 0);
    } else {
      buffer = this._ctx.createBuffer(2, endSample - startSample, this._sampleRate);
      buffer.copyToChannel(await this._Loader.getSampleDataByChannel(0, startSample, endSample), 0, 0);
      buffer.copyToChannel(await this._Loader.getSampleDataByChannel(1, startSample, endSample), 1, 0);
    };
    return buffer;
  };



/* ------------------------------------------------------------------ */
/* Transport State Management + Helpers */

  async _transport_setState(nextState = {}) {
    const validNextState = this._transport_validateNextState(nextState);
    if (!validNextState) return null;
    await this._transport_awaitBusyState();
    this._state.busy = true;
    await this._transport_scheduleDeltaChunks(validNextState);
    this._transport_applyNextState(validNextState);
    this._state.busy = false;
  };


  async _transport_awaitBusyState() {
    while (this._state.busy === true) {
      await new Promise(res => setTimeout(res, 16));
    };
    return true;
  };


/* validate nextState object and return null if invalid */
  _transport_validateNextState(nextState = {}) {
    const nextDirection = nextState?.direction;
    switch (true) {
      // no state change, abort
      case Object.entries(nextState).every(([key, val]) => this._state[key] === val):
        return null;
      // attempting to play reverse past zero, abort
      case ((this._state.resumeSample <= 0) && (nextDirection !== 1)):
        return null;
      // attempting to play past the end, abort
      case ((this._state.resumeSample >= this._totalSamples) && (nextDirection !== -1)):
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
    this._state.direction = nextState.nextDirection;
    this._state.scrubbing = nextState.nextScrubbing;
    this._state.playing = nextState.nextPlaying;
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
        ignoreGain: (startSpeed !== this._playbackSpeeds.min) && (endSpeed !== this._playbackSpeeds.min),
      });
    } else {    // change directions
      const midSample = await this._transport_pushRamp({
        startSpeed: startSpeed,
        endSpeed: this._playbackSpeeds.min,
        srcStartSample: srcStartSample,
        direction: startDirection,
      });
      await this._transport_pushRamp({
        startSpeed: this._playbackSpeeds.min,
        endSpeed: endSpeed,
        srcStartSample: midSample ? midSample : srcStartSample,
        direction: nextDirection,
      });
    };
  };


  _transport_getInitParams() {
    const lastScheduledChunk = this._scheduledQueue[this._scheduledQueue.length - 1];
    return {
      startSpeed: lastScheduledChunk?.ctxPlaybackSpeed ?? this._playbackSpeeds.min,
      startDirection: lastScheduledChunk?.direction ?? this._state.direction,
      srcStartSample: lastScheduledChunk?.srcEndSample ?? this._state.resumeSample,
      ctxStartGain: lastScheduledChunk?.ctxGain ?? 0,
    };
  };


  _transport_calcEndSpeed(nextPlaying, nextScrubbing) {
    let endSpeed = this._playbackSpeeds.min;
    if (nextPlaying === 1) {
      if (nextScrubbing === 1) {
        endSpeed = this._playbackSpeeds.scrub;
      };
      if (nextScrubbing === 0) {
        endSpeed = this._playbackSpeeds.base;
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
      this._pendingQueue.push(chunk);
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
      const gain = Math.max(0, Math.min(1, speed - this._playbackSpeeds.min));
      const lengthSrcSamples = this._rampChunkSamples * speed;
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
    const lengthSamples = lengthSeconds * this._sampleRate;
    const lengthRampChunks = Math.floor(lengthSamples / this._rampChunkSamples);
    const speedDelta = endSpeed - startSpeed;
    return speedDelta / lengthRampChunks;
  };



/* ------------------------------------------------------------------ */
/* Misc Helpers */

/* clamp seconds value to whole-sample equivalent float */
  _clampClock(seconds) {
    const timeSamples = seconds * this._sampleRate;
    const timeSamplesWhole = Math.round(timeSamples);
    return timeSamplesWhole / this._sampleRate;
  };


/* clamp speed value to whole-sample equivalent float */
  _clampSpeed(speed) {
    const safeSpeed = this.constructor.clampMinValidNumber(speed, this.constructor.MIN_PLAYBACK_SPEED);
    const srcChunkSamples = this._rampChunkSamples * safeSpeed;
    const targetSrcChunkSamples = Math.round(srcChunkSamples);
    const targetSpeed = (targetSrcChunkSamples / this._rampChunkSamples);
    return targetSpeed;
  };


/* clamp arbitrary sample value to integer within available range */
  _clampSample(sample) {
    if (sample < 0) {
      return 0;
    };
    if (sample >= this._totalSamples) {
      return this._totalSamples;
    };
    return parseInt(sample, 10);
  };



};
