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
const params = {
  sampleRate: 48e3,
  chunkLength: .02,
  lookahead: 10,
  latency: .2,
  playbackSpeed: 1,
  scrubSpeed: 8
};
const tape = new AudioTape(params);
```

For more information, see [customization](#customization).

### Activation

Before any audio can be rendered to the output, the `AudioTape` instance must first be activated in order to start the underlying `AudioContext`. Most browsers require an explicit user action (e.g. click, touch) to achieve this:

```js
function activateTape(e) {
  e.preventDefault();
  tape.activate();
  window.removeEventListener('click', activateTape);
};
window.addEventListener('click', activateTape);
```

### Loading Files

Files are loaded by providing a URL string:

```js
tape.load("/path/to/audioFile.wav");
```

Using Webpack:

```js
import audioFile from "./path/to/audioFile.wav";
tape.load(audioFile);
```

To load multiple files, an array of URL strings is used instead:

```js
const audioFiles = [
  "/path/to/audioFile1.wav",
  "/path/to/audioFile2.wav"
];
tape.load(audioFiles);
```

When loading multiple files, audio data will be concatenated to allow for seamless linear sequential playback in specified order.



## Playback

### Transport 

The following methods can be used to control playback:

`play()` Starts or resumes playback at current playhead time index.

`stop()` Stops playback.

`rev()` Starts reverse playback.

`ff()` Starts fast-forwarding.

`rew()` Starts rewinding.

Invocation enqueues a playback state change which the playback engine will dynamically ramp to from the current playback state. Methods are all asynchronous and will resolve with `true` when the ramp has been calculated and enqueued for playback. It is not necessary to `await` successful enqueueing before invocation of another transport method; the plaback engine utilizes a FIFO queue for scheduling whereby subsequent transport method invocations effectively cancel any previously scheduled changes to the playback state.

### Volume 

The current playback volume level can be read using the `volume` getter and set using the `setVolume()` method:

```js
console.log(tape.volume);  // 1
tape.setVolume(.5);
console.log(tape.volume);  // .5
```

The value specified for `volume` is a multipler of the default unity gain level (1).



## API

### Constructor:

#### `new AudioTape([params])`
> Creates a new `AudioTape` instance.
>
> **Arguments:**
>
> `params` *[object]* ***optional***: See [customization](#customization).

### Methods:

#### `load(src[, callback])` *\*async\**
> Loads audio file(s) for playback.
>
> **Arguments:**
>
> `src` *[string, array]*: URL(s) signifying the path(s) (relative or absolute) of audio files to load. Accepts either a single URL *[string]* or an *[array]* of URL *[string]* values.
>
> `callback` *[function]* ***optional***: function to be invoked upon successful completion of loading of each specified file. Function is passed a single argument  *[number]* representing the percent of files to have completed loading as a fraction of 1.
>
> **Returns:** `Promise`, resolves with `true` upon successful loading of all audio data.

#### `activate()`
> Activates the playback engine and starts/resumes the underlying `AudioContext`.
>
> **Returns:** `undefined`

#### `deactivate()`
> Deactivates the playback engine and suspends the underlying `AudioContext`.
>
> **Returns:** `undefined`

#### `play()` *\*async\**
> Transitions playback of audio from current speed and direction or resumes playback from current `playhead` time index to forward playback at `playbackSpeed`.
>
> **Returns:** `Promise`, resolves with `true` upon successful enqueueing of playback state change audio data.

#### `stop()` *\*async\**
> Transitions playback of audio from current speed and direction to stop.
>
> **Returns:** `Promise`, resolves with `true` upon successful enqueueing of playback state change audio data.

#### `rev()` *\*async\**
> Transitions playback of audio from current speed and direction or resumes playback from current `playhead` time index to reverse playback at `playbackSpeed`.
>
> **Returns:** `Promise`, resolves with `true` upon successful enqueueing of playback state change audio data.

#### `ff()` *\*async\**
> Transitions playback of audio from current speed and direction or resumes playback from current `playhead` time index to forward playback at `scrubSpeed`.
>
> **Returns:** `Promise`, resolves with `true` upon successful enqueueing of playback state change audio data.

#### `rew()` *\*async\**
> Transitions playback of audio from current speed and direction or resumes playback from current `playhead` time index to reverse playback at `scrubSpeed`.
>
> **Returns:** `Promise`, resolves with `true` upon successful enqueueing of playback state change audio data.

#### `setPlaybackSpeed(speed)`
> Sets the playback (forward or reverse) speed to specified value. If invoked during playback, will asynchronously invoke a state change in the playback engine and ramp to the new speed.
>
> **Arguments:**
>
> `speed` *[number]*: target playback speed.
>
> **Returns:** `undefined`

#### `setScrubSpeed(speed)`
> Sets the scrub (fast-forward or rewind) speed to specified value. If invoked while scrubbing, will asynchronously invoke a state change in the playback engine and ramp to the new speed.
>
> **Arguments:**
>
> `speed` *[number]*: target scrub speed.
>
> **Returns:** `undefined`

#### `setVolume(volume)`
> Sets the playback volume to specified value. 
>
> **Arguments:**
>
> `volume` *[number]*: target volume.
>
> **Returns:** `undefined`

### Getters:

#### `sampleRate`
> **Returns:** *[number]* the sample rate of the current `AudioContext`.

#### `active`
> **Returns:** *[boolean]* the current active state of the playback engine.

#### `totalSeconds` 
> **Returns:** *[number]* the total length in seconds of all loaded audio content.

#### `playhead`
> **Returns:** *[number]* the current playhead time index in seconds.

#### `lookahead`
> **Returns:** *[number]* the total length in seconds of the playback queue.

#### `latency`
> **Returns:** *[number]* the delay in seconds from when a transport method is invoked to when the playback engine will schedule transitional audio data for playback.

#### `playbackSpeed`
> **Returns:** *[number]* the speed of audio playback while playing (forward or reverse).

#### `scrubSpeed`
> **Returns:** *[number]* the speed of audio playback while scrubbing (fast-forward or reverse).

#### `volume`
> **Returns:** *[number]* the current output gain level.



## Customization

The following parameters can be specified when instantiating a new `AudioTape` instance:

**sampleRate**
*[number]*
**:**
target sample rate for the underlying `AudioContext` used for playback. Support is currently limited in most browsers.

**chunkLength**
*[number]*
**:**
duration (in seconds) of the individual audio chunks resident in the playback queue; value determines the granularity of any ramps in playback speed. Lower values allow for a smoother ramp effect but can be more expensive. Value is fixed at instantiation.

**lookahead**
*[number]*
**:**
total length (in seconds) of the playback queue. Value is fixed at instantiation.

**latency**
*[number]*
**:**
total delay (in seconds) between when a transport method is called and when changes in playback will be scheduled to begin. Value is fixed at instantiation.

**playbackSpeed**
*[number]*
**:**
speed used for playback; value is a multiplier of the default playback speed of the source audio (1). Can be changed after instantiation via `setPlaybackSpeed()` method.

**scrubSpeed**
*[number]*
**:**
speed used for fast-forward and reverse playback; value is a multiplier of the default playback speed of the source audio (1).Can be changed after instantiation via `setScrubSpeed()` method.

**LOW\_MEMORY\_MODE**
*[boolean]*
**:**
**\*\*EXPERIMENTAL\*\***
When set to `true`, limits the amount of decoded PCM data retained in memory at any given time. Useful when loading large amounts of audio on devices with limited memory (e.g. mobile).



## Example
The following example was built using React:

[Basic demo](https://kozak.digital/audiotape/) ([Github](https://github.com/mpkozak/audiotape_demo))

[Advanced demo](https://kozak.digital/rls/)