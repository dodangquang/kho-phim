/* SHA-256 over UTF-8; no Web Crypto dependency on older TV Web runtimes. */
(function (global) {
  'use strict';
  var constants = [1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298];
  function rotate(value, count) { return (value >>> count) | (value << (32 - count)); }
  global.KhoUpdateHash = function (text) {
    var bytes = unescape(encodeURIComponent(text));
    var length = bytes.length;
    var words = [];
    var hash = [1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225];
    var i; var j;
    for (i = 0; i < length; i++) words[i >> 2] = (words[i >> 2] || 0) | (bytes.charCodeAt(i) << (24 - (i % 4) * 8));
    words[length >> 2] = (words[length >> 2] || 0) | (128 << (24 - (length % 4) * 8));
    var end = (((length + 8) >> 6) + 1) * 16;
    words[end - 1] = length * 8;
    for (i = 0; i < end; i += 16) {
      var w = [];
      for (j = 0; j < 64; j++) {
        if (j < 16) w[j] = words[i + j] | 0;
        else {
          var x = w[j - 15]; var y = w[j - 2];
          w[j] = (w[j - 16] + (rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3)) + w[j - 7] + (rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10))) | 0;
        }
      }
      var a = hash[0]; var b = hash[1]; var c = hash[2]; var d = hash[3];
      var e = hash[4]; var f = hash[5]; var g = hash[6]; var h = hash[7];
      for (j = 0; j < 64; j++) {
        var first = (h + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + ((e & f) ^ (~e & g)) + constants[j] + w[j]) | 0;
        var second = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + first) | 0; d = c; c = b; b = a; a = (first + second) | 0;
      }
      var values = [a,b,c,d,e,f,g,h];
      for (j = 0; j < 8; j++) hash[j] = (hash[j] + values[j]) | 0;
    }
    var result = '';
    for (i = 0; i < 8; i++) result += ('00000000' + (hash[i] >>> 0).toString(16)).slice(-8);
    return result;
  };
}(window));
