# AudioTape

AudioTape is an browser-based audio playback engine that simulates both the sound and transport interface of analog audio tape. Built on top of the [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API), 

allows for realtime playback of audio files 

with sample-accurate 
bi-directional 

## Installation
Using npm: 
`npm install audiotape`

## Setup

#### Importing
To import AudioTape into an ES2015 application:

```js
import AudioTape from "audiotape";
```

#### Polyfills
A polyfill for standardizing the Web Audio API in browsers with partial/incomplete support is also available. 
specific parts of the WebAudio API required for `AudioTape`. 

While not required in most modern browsers, the option is included for 

 `polyfills()` should be run before instantiating a new `AudioTape` instance.

```js
import AudioTape, { polyfills } from "audiotape";
polyfills();
```

#### Setup
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
  scrubSpeed: 5,
};

const tape = new AudioTape(params);
```
For more information, see [customization](#Customization).

## Usage
#### Loading Files
There are several ways to load audio files for playback. 



#### Loading Files
Multiple files can be loaded
When more than one file is loaded, 

```js
import audioFile from "./path/to/audio.wav"

const tape = new AudioTape();
```


# Customization
  sampleRate: 48e3,
  chunkLength: .02,
  lookahead: 2,
  latency: .1,
  playbackSpeed: 1,
  scrubSpeed: 5,

### Usage

new AudioTape();
new AudioTape(params<object>);
new AudioTape(fileURL<string>[, params<object>]);
new AudioTape(fileURLs<array: strings>[, params<object>]);



Polyfills

## API
