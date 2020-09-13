import { Player } from './';





export default class AudioTape {
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
    if (!files.length) return null;
    let urls = files;
    if (files.length === 1 && Array.isArray(files[0])) {
      urls = files[0];
    };
    if (!urls.every(d => typeof d === 'string')) return null;
    await this._Player.load(urls);
    return true;
  };


  getPlayhead() {
    return this._Player.playhead;
  };
};
