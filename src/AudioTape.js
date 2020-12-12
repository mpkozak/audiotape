import {
  Player,
  Loader,
  LoaderLite,
} from './';



export default class AudioTape {

/* ------------------------------------------------------------------ */
/* Getters */

  get sampleRate() {
    return this._Player.sampleRate;
  };

  get active() {
    return this._Player.active;
  };

  get totalSeconds() {
    return this._Player.totalSeconds;
  };

  get playhead() {
    return this._Player.playhead;
  };

  get lookahead() {
    return this._Player.lookahead;
  };

  get latency() {
    return this._Player.latency;
  };

  get playbackSpeed() {
    return this._Player.playbackSpeed;
  };

  get scrubSpeed() {
    return this._Player.scrubSpeed;
  };

  get volume() {
    return this._Player.volume;
  };



/* ------------------------------------------------------------------ */
/* Constructor */

  constructor({
    sampleRate = 48e3,
    chunkLength = .02,
    lookahead = 10,
    latency = .2,
    playbackSpeed = 1,
    scrubSpeed = 8,
    LOW_MEMORY_MODE = false,
  } = {}) {
    // Player class instance
    this._Player = new Player({
      sampleRate,
      chunkLength,
      lookahead,
      latency,
      playbackSpeed,
      scrubSpeed,
      Loader: LOW_MEMORY_MODE ? LoaderLite : Loader,
    });
    // Public engine methods
    this.load = this._Player.load;
    this.activate = this._Player.activate;
    this.deactivate = this._Player.deactivate;
    // Public transport methods
    this.play = this._Player.play;
    this.stop = this._Player.stop;
    this.rev = this._Player.rev;
    this.ff = this._Player.ff;
    this.rew = this._Player.rew;
    // Public configuration methods
    this.setPlaybackSpeed = this._setPlaybackSpeed.bind(this);
    this.setScrubSpeed = this._setScrubSpeed.bind(this);
    this.setVolume = this._setVolume.bind(this);
  };



/* ------------------------------------------------------------------ */
/* Public Configuration Methods */

  _setPlaybackSpeed(speed) {
    this._Player.playbackSpeed = speed;
  };

  _setScrubSpeed(speed) {
    this._Player.scrubSpeed = speed;
  };

  _setVolume(val) {
    this._Player.volume = val;
  };



};
