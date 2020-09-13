import { Player } from './';



/*
Usage:

  const params = {
    sampleRate<number>,
    chunkLength<number>,    [seconds]
    lookahead<number>,      [seconds]
    latency<number>,        [seconds]
    playbackSpeed<number>,  [multiplier]
    scrubSpeed<number>,     [multiplier]
  };

  new AudioTape();
  new AudioTape(params<object>);
  new AudioTape(fileURL<string>[, params<object>]);
  new AudioTape(fileURLs<array: strings>[, params<object>]);

*/



export default class AudioTape {
  set fileURLs(urls) {
    if (typeof urls === 'string') {
      this._fileURLs = [urls];
    } else if (Array.isArray(urls) && urls.every(d => typeof d === 'string')) {
      this._fileURLs = urls;
    };
  };


  _parseArgs(args) {

  }

  constructor(...args) {
    let _fileURLs,
        _params;
    switch (args.length) {
      case 2:
        if (typeof args[0] === 'string') {
          _fileURLs = [args[0]];
        };
        if (Array.isArray(args[0]) && args[0].every(d => typeof d === 'string')) {
          _fileURLs = args[0];
        };
        if (typeof args[1] === 'object') {
          _params = args[1];
        };
        break;
      case 1:
        if (typeof args[0] === 'string') {
          _fileURLs = [args[0]];
          break;
        };
        if (Array.isArray(args[0]) && args[0].every(d => typeof d === 'string')) {
          _fileURLs = args[0];
          break;
        };
        if (typeof args[0] === 'object') {
          _params = args[0];
        };
        break;
      case 0:
        break;
      default:
        throw new Error('Invalid constructor arguments');
    };
    const fileURLs = _fileURLs;
    const params = _params;
    this._Player = new Player({
      sampleRate: params.sampleRate || 48e3,
      chunkSeconds: params.chunkLength || .02,
      lookahead: params.lookahead || 2,
      latency: params.latency || .1,
      playbackSpeed: params.playbackSpeed || 1,
      scrubSpeed: params.scrubSpeed || 5,
    });
    this.load = this.load.bind(this);
    this.getPlayhead = this.getPlayhead.bind(this);
    this.play = this._Player.transport.play;
    this.stop = this._Player.transport.stop;
    this.rew_start = this._Player.transport.rew_start;
    this.rew_stop = this._Player.transport.rew_stop;
    this.ff_start = this._Player.transport.ff_start;
    this.ff_stop = this._Player.transport.ff_stop;
    if (fileURLs.length) {
      this.load(...fileURLs);
    };
  };


  async load(...files) {
    await this._Player.load(files);
    return true;
  };


  getPlayhead() {
    return this._Player.playhead;
  };
};
