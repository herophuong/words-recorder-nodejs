var express = require('express');
var router = express.Router();
var fs = require('fs');
var path = require('path');
var util = require('util');
var child_process = require('child_process');

/* UPLOAD ROUTE */
router.post('/upload', function(req, res) {
  var recorder = req.body.recorder;
  var upload_path = path.join(appRoot, 'public', 'upload', recorder);
  var recorderWordFolder = path.join(appRoot, 'public', 'upload', recorder);
  var wordFile = req.files.data.originalname;

  // Move uploaded file from /upload to /public/upload/recorder
  fs.rename(req.files.data.path, path.join(upload_path, wordFile), function (err) {
    if (err) {
      res.status(500);
      res.send({status: 'nok', message: "Can't move uploaded file to account folder"});
    } else {
      // Check for ending silence
      child_process.execFile(
        'bin/has_end_silence.sh',
        [path.join(recorderWordFolder, wordFile)],
        function(error, stdout, stderr) {
          if (stdout.indexOf('1') == 0) {
            req.files.data.clipped = false;
          } else {
            req.files.data.clipped = true;
          }
          // Return checked result
          res.send({status: 'ok', message: req.files});

          // Save checked result to words.json
          var recorderWordList = path.join(appRoot, 'public', 'upload', recorder, 'words.json');
          fs.readFile(recorderWordList, 'utf8', function(err, data) {
            words = JSON.parse(data);
            for (var i = 0; i < words.length; i++) {
              if (wordFile == words[i].name + ".wav") {
                words[i].clipped = req.files.data.clipped;
                words[i].checked_mtime = fs.statSync(path.join(recorderWordFolder, wordFile)).mtime.getTime();
              }
            }
            fs.writeFile(recorderWordList, JSON.stringify(words, null, 2))
          });
        }
      )
    }
  });
});

/* WORD LIST ROUTE */
router.get('/words', function(req, res) {
  var recorder = req.query.recorder;
  if (!recorder) {
    res.status(500);
    res.send({status: 'nok', message: 'Please specify recorder name'});
    return;
  }
  var recorderWordList = path.join(appRoot, 'public', 'upload', recorder, 'words.json');
  var defaultWordList = path.join(appRoot, 'data', 'words.json');
  var recorderWordFolder = path.join(appRoot, 'public', 'upload', recorder);

  var processWordList = function (data) {
    words = JSON.parse(data);
    fs.readdir(recorderWordFolder, function (err, files) {
      if (err) {
        res.status(500);
        res.send({status: 'nok', message: 'Can\'t read your account folder'});
        return;
      }

      var wordFile, fileStat, mtime, wordRecordedCount = 0, wordCheckedCount = 0, wordCheckQueue = [];
      for (var i = 0; i < words.length; i++) {
        wordFile = words[i].name + '.wav';
        if (files.indexOf(wordFile) > -1) {
          words[i].recorded = true;
          wordRecordedCount++;

          // Check modified time
          fileStat = fs.statSync(path.join(recorderWordFolder, wordFile));
          mtime = fileStat.mtime.getTime();

          // Check clipped word
          if (!(words[i].checked_mtime && mtime == words[i].checked_mtime)) {
            wordCheckQueue.push(words[i]);
          }
        }
      }
      // Process queue
      var processWordQueue = function() {
        if (wordCheckQueue.length == 0) {
          res.send({status: 'ok', message: words});
          fs.writeFile(recorderWordList, JSON.stringify(words, null, 2));
        } else {
          var word = wordCheckQueue.shift(),
              wordFile = word.name + '.wav';
          child_process.execFile(
            'bin/has_end_silence.sh',
            [path.join(recorderWordFolder, wordFile)],
            function(error, stdout, stderr) {
              if (stdout.indexOf('1') == 0) {
                word.clipped = false;
              } else {
                word.clipped = true;
              }
              word.checked_mtime = mtime;
              processWordQueue();
            }
          );
        }
      };
      processWordQueue();
    });
  }

  fs.readFile(recorderWordList, 'utf8', function(err, data) {
    if (err) {
      fs.readFile(defaultWordList, 'utf8', function(err, data) {
        if (err) {
          res.status(500);
          res.send({status: 'nok', message: 'Can\'t read word list'});
          return;
        }

        processWordList(data);
      });
      return;
    }

    processWordList(data);
  });
});

module.exports = router;
