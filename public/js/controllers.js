/**
 * Angular App here
 */
var trvnApp = angular.module('trvnApp', ['ngCookies', 'infinite-scroll', 'ui.bootstrap']);

trvnApp.factory('WordRecorder', function($rootScope, $q) {
  var canRecord = false;
  var recorder = null;
  var volume = null;
  var audioInput = null;
  var sampleRate = null;
  var audioContext = null;
  var context = null;
  var bufferSize = 2048;
  var progress = 0;

  // Detect audio recording
  if (!navigator.getUserMedia)
      navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia ||
                    navigator.mozGetUserMedia || navigator.msGetUserMedia;

  if (navigator.getUserMedia) {
      navigator.getUserMedia({audio:true}, function(e) {
        $rootScope.$apply(function() { canRecord = true });

        // creates the audio context
        audioContext = window.AudioContext || window.webkitAudioContext;
        context = new audioContext();
        sampleRate = context.sampleRate;

        // creates a gain node
        volume = context.createGain();

        // creates an audio node from the microphone incoming stream
        audioInput = context.createMediaStreamSource(e);

        // connect the stream to the gain node
        audioInput.connect(volume);

        /* From the spec: This value controls how frequently the audioprocess event is
        dispatched and how many sample-frames need to be processed each call.
        Lower values for buffer size will result in a lower (better) latency.
        Higher values will be necessary to avoid audio breakup and glitches */
        recorder = context.createScriptProcessor(bufferSize, 2, 2);

        // we connect the recorder
        volume.connect (recorder);
        recorder.connect (context.destination);
      }, function(e) {
        alert('Error capturing audio.');
      });
  } else {
    alert('getUserMedia not supported in this browser.');
  }

  var record = function(length) {
    var sampleLength = length * sampleRate / 1000;
    var leftchannel = [];
    var rightchannel = [];
    var recordingLength = 0;
    var deferred = $q.defer();

    recorder.onaudioprocess = function(e) {
      if (recordingLength > sampleLength) {
        recorder.onaudioprocess = null;

        // we flat the left and right channels down
        var leftBuffer = mergeBuffers ( leftchannel, recordingLength );
        var rightBuffer = mergeBuffers ( rightchannel, recordingLength );
        // we interleave both channels together
        var interleaved = interleave ( leftBuffer, rightBuffer );

        // we create our wav file
        var buffer = new ArrayBuffer(44 + interleaved.length * 2);
        var view = new DataView(buffer);

        // RIFF chunk descriptor
        writeUTFBytes(view, 0, 'RIFF');
        view.setUint32(4, 44 + interleaved.length * 2, true);
        writeUTFBytes(view, 8, 'WAVE');
        // FMT sub-chunk
        writeUTFBytes(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        // stereo (2 channels)
        view.setUint16(22, 2, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 4, true);
        view.setUint16(32, 4, true);
        view.setUint16(34, 16, true);
        // data sub-chunk
        writeUTFBytes(view, 36, 'data');
        view.setUint32(40, interleaved.length * 2, true);

        // write the PCM samples
        var lng = interleaved.length;
        var index = 44;
        var volume = 1;
        for (var i = 0; i < lng; i++){
            view.setInt16(index, interleaved[i] * (0x7FFF * volume), true);
            index += 2;
        }

        // our final binary blob
        var blob = new Blob ( [ view ], { type : 'audio/wav' } );
        deferred.resolve(blob);

        return; // Stop here
      }

      var left = e.inputBuffer.getChannelData (0);
      var right = e.inputBuffer.getChannelData (1);
      // we clone the samples
      leftchannel.push (new Float32Array (left));
      rightchannel.push (new Float32Array (right));
      recordingLength += bufferSize;
      $rootScope.$apply(function() {
        // notify progress
        deferred.notify(recordingLength / sampleLength);
      });
    }

    return deferred.promise;
  }

  var interleave = function (leftChannel, rightChannel){
    var length = leftChannel.length + rightChannel.length;
    var result = new Float32Array(length);

    var inputIndex = 0;

    for (var index = 0; index < length; ){
      result[index++] = leftChannel[inputIndex];
      result[index++] = rightChannel[inputIndex];
      inputIndex++;
    }
    return result;
  }

  var mergeBuffers = function (channelBuffer, recordingLength){
    var result = new Float32Array(recordingLength);
    var offset = 0;
    var lng = channelBuffer.length;
    for (var i = 0; i < lng; i++){
      var buffer = channelBuffer[i];
      result.set(buffer, offset);
      offset += buffer.length;
    }
    return result;
  }

  var writeUTFBytes = function(view, offset, string){
    var lng = string.length;
    for (var i = 0; i < lng; i++){
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  return {
    record: record,
    canRecord: function() {
      return canRecord;
    }
  };
});

trvnApp.controller('WordCtrl', function ($scope, $http, $cookies, WordRecorder, $timeout, $interval, $sce) {
  $scope.words = [];
  $scope.recorder = null;
  $scope.logged_in = false;
  $scope.filter = {
    "diacritic" : {
      "unmarked": true,
      "acute": true,
      "grave": true,
      "hook": true,
      "tilde": true,
      "dot": true
    },
    "status": {
      "recorded": true,
      "unrecorded": true
    },
    "name" : ""
  };
  $scope.totalDisplayed = 100;
  $scope.canRecord = WordRecorder.canRecord;
  $scope.recordProgress = WordRecorder.progress;

  // Record options
  $scope.option = {
    "recordLength": 1000,
    "waitingTime": 1000
  };

  // Option protection
  $scope.$watch('option.recordLength', function(newValue) {
    if (!(newValue <= 3000 && newValue >= 700)) {
      $scope.option.recordLength = 1000;
    }
  });
  $scope.$watch('option.waitingTime', function(newValue) {
    if (!(newValue <= 2000 && newValue >= 0)) {
      $scope.option.recordLength = 1000;
    }
  });

  // Reset pagination when filter change to avoid UI freezing
  var reset_pagination = function() {$scope.totalDisplayed = 100;};
  $scope.$watch('filter', reset_pagination, true);

  $scope.totalRecorded = function() {
    var total = 0;
    for (var i = 0; i < $scope.words.length; i++) {
      if ($scope.words[i].recorded)
        total += 1;
    }
    return total;
  };

  var fuzzy_match = function(str,pattern){
      if (pattern.length > 0) {
        pattern = pattern.split("").reduce(function(a,b){ return a+".*"+b; });
        return (new RegExp(pattern)).test(str);
      } else {
        return true;
      }
  };

  $scope.query = function(word) {
    return (
      (word.recorded == false && $scope.filter.status.unrecorded ||
      word.recorded && $scope.filter.status.recorded) &&
      $scope.filter.diacritic[word.diacritic] &&
      fuzzy_match(word.name, $scope.filter.name)
    );
  };
  $scope.record = function(word) {
    if (!$scope.canRecord)
      return;

    // Run a wait indicator for current word
    word.waiting = true;
    word.waitingLeft = $scope.option.waitingTime;
    var waitingIndicator = $interval(function() {
      word.waitingLeft -= 100;
      if (word.waitingLeft <= 0)
        $interval.cancel(waitingIndicator);
    },100);

    // Wait some second to avoid recording mouse click
    $timeout(function () {
      word.waiting = false;
      word.recording = true;
      word.progress = 0;

      WordRecorder.record($scope.option.recordLength).then(function(blob) {
        word.recording = false;
        word.uploading = true;

        // playback after recorded
        var audio = new Audio();
        audio.src = URL.createObjectURL(blob);
        audio.play();

        // attach blob to the model
        word.blob = blob;

        // let's upload it
        var fd = new FormData();
        fd.append('recorder', $scope.recorder);
        fd.append('data', blob, word.name + '.wav');
        $.ajax({
          type: 'POST',
          url: 'upload',
          data: fd,
          processData: false,
          contentType: false
        }).done(function(data) {
          $scope.$apply(function() {
            // update word state
            word.recorded = true;
            word.uploading = false;
          });
        });
      }, null, function (progress) {
        word.progress = (progress > 1) ? 1 : progress;
      });
    }, $scope.option.waitingTime);
  }

  $scope.logIn = function(recorder) {
    $scope.recorder = recorder;
    $http.get('words?recorder=' + recorder).success(function(data){
      $scope.words = data.message;
      $scope.logged_in = true;
      $cookies.recorder = recorder;
    });
  }
  $scope.logOut = function() {
    $scope.logged_in = false;
    $scope.recorder = null;
    delete $cookies.recorder;
  }

  $scope.showMore = function() {
    $scope.totalDisplayed += 100;
    if ($scope.totalDisplayed > $scope.words.length) {
      $scope.totalDisplayed = $scope.words.length;
    }
  }

  $scope.play = function(word) {
    // Create new audio object then bind loading event to word object
    var audio = new Audio();
    audio.oncanplaythrough = function() {
      $scope.$apply(function() {
        word.downloading = false;
        word.playing = true;
      });
      // play after ready
      audio.play();
    }
    audio.onended = function() {
      $scope.$apply(function() {
        word.playing = false;
      });
    }

    // Now add audio src
    if (word.blob) {
      audio.src = URL.createObjectURL(word.blob);
    } else {
      word.downloading = true;
      audio.src = 'upload/' + $scope.recorder + '/' + word.name + '.wav?cb=' + new Date().getTime();
    }
  }

  // Auto login using cookies
  if ($cookies.recorder && $cookies.recorder != null) {
    $scope.logIn($cookies.recorder);
  }
});
