var express = require('express');
var router = express.Router();
var fs = require('fs');
var path = require('path');

/* UPLOAD ROUTE */
router.post('/upload', function(req, res) {
  var recorder = req.body.recorder;
  var upload_path = path.join(appRoot, 'public', 'upload', recorder);

  fs.rename(req.files.data.path, path.join(upload_path, req.files.data.originalname), function (err) {
    if (err) {
      res.status(500);
      res.send({status: 'nok', message: "Can't move uploaded file to account folder"});
    } else {
      res.send({status: 'ok', message: req.files});
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

  fs.readFile(path.join(appRoot, 'data', 'words.json'), 'utf8', function(err, data) {
    if (err) {
      res.status(500);
      res.send({status: 'nok', message: 'Can\'t read word list'});
      return;
    }

    words = JSON.parse(data);
    fs.readdir(path.join(appRoot, 'public', 'upload', recorder), function (err, files) {
      if (err) {
        res.status(500);
        res.send({status: 'nok', message: 'Can\'t read your account folder'});
        return;
      }

      for (var i = 0; i < words.length; i++) {
        if (files.indexOf(words[i].name + '.wav') > -1)
          words[i].recorded = true;
      }

      res.send({status: 'ok', message: words});
    });
  });
});

module.exports = router;
