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
  new AudioTape(fileURLs<array: strings>[, params<object>]);
  new AudioTape(fileURL<string>[, fileURL<string>, ..., fileURL<string>][, params<object>]);

*/



export default class AudioTape {
  constructor(...args) {
    const fileURLs = [];
    const params = {};
    while (args.length) {
      const lastArg = args.pop();
      if (Array.isArray(lastArg)) {
        if (lastArg.every(d => typeof d === 'string')) {
          fileURLs.push(...lastArg);
        };
        continue;
      };
      if (typeof lastArg === 'string') {
        fileURLs.push(...lastArg);
        continue;
      };
      if (typeof lastArg === 'object') {
        Object.assign(params, ...lastArg);
        continue;
      };
    };
    this.Player = new Player({
      sampleRate = params.sampleRate || 48e3,
      chunkSeconds = params.chunkLength || .02,
      lookahead = params.lookahead || 2,
      latency = params.latency || .1,
      playbackSpeed = params.playbackSpeed || 1,
      scrubSpeed = params.scrubSpeed || 5,
    });
    this.load = this.load.bind(this);
    this.getPlayhead = this.getPlayhead.bind(this);
    this.play = this.Player.transport.play;
    this.stop = this.Player.transport.stop;
    this.rew_start = this.Player.transport.rew_start;
    this.rew_stop = this.Player.transport.rew_stop;
    this.ff_start = this.Player.transport.ff_start;
    this.ff_stop = this.Player.transport.ff_stop;
    if (fileURLs.length) {
      this.load(fileURLs);
    };
  };


  async load(...files) {
    await this.Player.load(files);
    return true;
  };


  getPlayhead() {
    return this.Player.playhead;
  };
};
