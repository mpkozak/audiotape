import _AudioContext from './AudioContext';
import _AudioBuffer from './AudioBuffer';



/** Shims adaped from: @mohayonao/web-audio-api-shim **/
export default function polyfills() {
  void _AudioContext();
  void _AudioBuffer();
};
