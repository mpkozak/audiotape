# AudioTape

AudioTape is an browser-based audio playback engine that simulates the sound, playback mechanics, and transport interface of analog reel-to-reel tape machine. Built on top of the [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API), AudioTape supports the loading and concatenation of audio files in multiple formats and allows realtime, bi-directional playback with smooth, sample-accurate ramping of both playback speed and direction.

## Installation

Using npm: 
`npm install audiotape`

## Setup

### Importing

To import AudioTape into an ES2015 application:

```js
import AudioTape from "audiotape";
```

### Polyfills

A polyfill for standardizing the Web Audio API is also available for use in browsers with incomplete or partial/prefixed support. While not required in most settings, the option is included for convenience as the provided shims target only the specific parts of the WebAudio API used by `AudioTape`.

`polyfills()` should be run before instantiating a new `AudioTape` instance:

```js
import AudioTape, { polyfills } from "audiotape";
polyfills();
```

## Usage

To create a new AudioTape instance:

```js
const tape = new AudioTape();
```

Playback and performance characteristics can also be customized by passing a configuration object to the `AudioTape` constructor:

```js
// default values
const config = {
  sampleRate: 48e3,
  chunkLength: .02,
  lookahead: 2,
  latency: .1,
  playbackSpeed: 1,
  scrubSpeed: 5
};
const tape = new AudioTape(params);
```

For more information, see [customization](#Customization).

##### Arguments:

`new AudioTape([file(s)][, config])`

## Loading Files

`AudioTape` uses `fetch()` to load audio data.

Files are loaded by providing a URL string:

```js
const tape = new AudioTape("/path/to/audioFile.wav");
```

Using Webpack:

```js
import audioFile from "./path/to/audioFile.wav";
const tape = new AudioTape(audioFile);
```

To load multiple files, an array of URL strings is used instead:

```js
const audioFiles = [
  "/path/to/audioFile1.wav",
  "/path/to/audioFile2.wav"
];
const tape = new AudioTape(audioFiles);
```

When loading multiple files, audio data will be concatenated to allow for seamless linear sequential playback in specified order.

## Playback

The following methods can be used to control playback:

`play()`
> Starts or resumes playback at current playhead time index.

`stop()`
> Stops playback.

`rew_start()`
> Starts rewinding.

`rew_stop()`
> Stops rewinding.

`ff_start()`
> Starts fast-forwarding.

`ff_stop()`
> Stops fast-forwarding.

Transport methods for are all asynchronous and return `undefined`. Invocation enqueues a playback state change which the playback engine will ramp to from the current playback state.

## Other Methods

`load()`
> Asynchronous. Can be used to load files after instantiation of a new `AudioTape`. Accepts URL strings as either multiple arguments or within an array as a single argument.

`getPlayhead()`
> Returns the current playhead time index in seconds.

## Customization

The following parameters can be customized when instantiating a new `AudioTape` instance:

##### sampleRate:
> [Number] Target sample rate for the `AudioContext` used for playback. Support is currently limited in most browsers.

##### chunkLength:
> [Number] Duration (in seconds) of the individual audio chunks resident in the playback queue. This value determines the granularity of any ramps in playback speed. Lower values allow for a smoother ramp effect but can be more expensive.

##### lookahead:
> [Number] Total length (in seconds) of the playback queue.

##### latency:
> [Number] Total delay (in seconds) between when a transport method is called and when changes in playback will be scheduled to begin.

##### playbackSpeed:
> [Number] Speed used for playback. Value is a multiplier of the default playback speed of the source audio (1).

##### scrubSpeed:
> [Number] Speed used for fast-forward and reverse playback. Value is a multiplier of the default playback speed of the source audio (1).

## Example
The following example was built using React:

[Live demo](https://kozak.digital/audiotape/)

[Github](https://github.com/mpkozak/audiotape_demo)
