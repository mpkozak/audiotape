import {
  Player,
  Loader,
  LoaderLite,
} from './modules';



export default class AudioTape {

/* ------------------------------------------------------------------ */
/* Private fields */

  #Player;



/* ------------------------------------------------------------------ */
/* Getters */

  get sampleRate() {
    return this.#Player.sampleRate;
  };

  get active() {
    return this.#Player.active;
  };

  get totalSeconds() {
    return this.#Player.totalSeconds;
  };

  get playhead() {
    return this.#Player.playhead;
  };

  get lookahead() {
    return this.#Player.lookahead;
  };

  get latency() {
    return this.#Player.latency;
  };

  get playbackSpeed() {
    return this.#Player.playbackSpeed;
  };

  get scrubSpeed() {
    return this.#Player.scrubSpeed;
  };

  get volume() {
    return this.#Player.volume;
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
    this.#Player = new Player({
      sampleRate,
      chunkLength,
      lookahead,
      latency,
      playbackSpeed,
      scrubSpeed,
      Loader: LOW_MEMORY_MODE ? LoaderLite : Loader,
    });
    // Public engine methods
    this.load = this.#Player.load;
    this.activate = this.#Player.activate;
    this.deactivate = this.#Player.deactivate;
    // Public transport methods
    this.play = this.#Player.play;
    this.stop = this.#Player.stop;
    this.rev = this.#Player.rev;
    this.ff = this.#Player.ff;
    this.rew = this.#Player.rew;
    // Public configuration methods
    this.setPlaybackSpeed = this._setPlaybackSpeed.bind(this);
    this.setScrubSpeed = this._setScrubSpeed.bind(this);
    this.setVolume = this._setVolume.bind(this);
  };



/* ------------------------------------------------------------------ */
/* Public Configuration Methods */

  _setPlaybackSpeed(speed) {
    this.#Player.playbackSpeed = speed;
  };

  _setScrubSpeed(speed) {
    this.#Player.scrubSpeed = speed;
  };

  _setVolume(val) {
    this.#Player.volume = val;
  };



};
