var SerialPort = require('serialport').SerialPort;
var serialPort = new SerialPort('/dev/ttyAMA0', {
  baudrate: 38400
});
var fs = require('fs');
var http = require('http');


// Whether we are currently blocking serial communiction because
// a photo capture is in progress.
var takingPhoto = false;


// Command Variables
var x = 00;
var y = 00;
var resetCommand = new Buffer([86, 00, 38, 00]);
var takePic = new Buffer([86, 00, 54, 01, 00]);
var readSize = new Buffer([86, 00, 52, 01, 00]);
var readPic = new Buffer([86, 00, 50, 12, 00, 10, 00, 00, 00, 00, 00, 00, x, y, 00, 10]);

// State flags
var resetState = true;
var takeState  = false;
var sizeState  = false;
var readState  = false;
var serialReady  = false;

// Return data expectations.
var takeReturn = new Buffer([118, 00, 54, 00, 00]);
var sizeReturn = new Buffer([118, 00, 52, 00, 04, 00, 00]);
var readReturn = new Buffer([118, 00, 50, 00, 00]);
var resetReturn = [118, 00, 38, 00];
var returnedReset = new Array();
var returnedSize = new Array();
var returnedImage = new Array();

http.createServer(function(req, res) {
  var action = req.url;
  if (action == '/image.jpg') {
    fs.readFile('./image.jpg', function(error, img) {
      if (error) {
        res.writeHead(501, {'Content-Type': 'text/html'});
        res.end('<html><body>An internal error occurred.</body></html>');
      }
      else {
        res.writeHead(200, {'Content-Type': 'image/jpeg', 'Cache-Control': 'no-cache, must-revalidate'});
        res.end(img, 'binary');
      }
      if (!takingPhoto) {
        reload();
        snapIt();
      }
    });
  }
  if (action == '/') {
    var indexPage = fs.readFile('./index.html', function(error, indexPage) {
      if (error) {
        res.writeHead(501, {'Content-Type': 'text/html'});
        res.end('<html><body>An internal error occurred.</body></html>');
      }
      else {
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end(indexPage);
      }
    });
  }
}).listen(8881);

serialPort.open(function () {
  serialReady = true;
});

serialPort.on('data', function(data) {
  var newData = data.toJSON();
  if (resetState) {
    returnedReset = returnedReset.concat(newData);

    if (
      returnedReset[0] == 118 &&
      returnedReset[1] == 0   &&
      returnedReset[2] == 38  &&
      returnedReset[3] == 0   &&
      returnedReset.length == 71
    ) {
      triggerShutter(function() {
        console.log('Shutter is done triggering.');
      if (sizeState) {
        returnedSize = returnedSize.concat(newData);
        if (returnedSize.length == 9) {
          var mem1 = returnedSize[7];
          var mem2 = returnedSize[8];
          getImageData(mem1, mem2);
        }
      }
      if (readState) {
        returnedImage = returnedImage.concat(newData);
        if (
          returnedImage[returnedImage.length - 7] == 255 &&
          returnedImage[returnedImage.length - 6] == 217 &&
          returnedImage[returnedImage.length - 5] == 118 &&
          returnedImage[returnedImage.length - 4] == 0   &&
          returnedImage[returnedImage.length - 3] == 50  &&
          returnedImage[returnedImage.length - 2] == 0   &&
          returnedImage[returnedImage.length - 1] == 0
        ) {
          console.log('Writing image');
          var begin = returnedImage.indexOf(255);
          console.log(begin);
          var end = returnedImage.lastIndexOf(255);
          console.log(end);
          returnedImage = returnedImage.slice(begin, end);
          var image = new Buffer(returnedImage);
          fs.appendFile('image.jpg', image, function (err) {
            if (err) throw err;
          });
          takingPhoto = false;
        }
      }
      if (data.toString() == takeReturn.toString() && takeState) {
        getSize();
      }
    }
});

function snapIt() {
  takingPhoto = true;
  console.log('reset');
  serialPort.write(resetCommand, function(err, results) {
    if (err) {
      console.error('err ', err);
    }
    else {
      console.log(results + ' bytes sent');
    }
  });
  resetState = true;
  takeState  = false;
  sizeState  = false;
  readState  = false;
}

function triggerShutter(next) {
  var buf = new Buffer(0);
  fs.writeFile('image.jpg', buf, function (err) {
    if (err) {
      next(err);
    }
    console.log('take picture');
    serialPort.write(takePic, function(err, results) {
      if (err) {
        console.log('err ' + err);
        if (err) {
          next(err);
        }
      }
      else {
        console.log(results + ' bytes sent');
      }
      resetState = false;
      takeState  = true;
      sizeState  = false;
      readState  = false;
      next();
    });
  });
}

function getSize() {
  console.log('getting size');
  serialPort.write(readSize, function(err, results) {
    if (err) {
      console.log('err ' + err);
    }
    else {
      console.log(results + ' bytes sent');
    }
  });
  resetState = false;
  takeState  = false;
  sizeState  = true;
  readState  = false;
}

function getImageData(m1, m2) {
  console.log('reading image');
  readPic[12] = m1;
  readPic[13] = m2;
  serialPort.write(readPic, function(err, results) {
    if (err) {
      console.log('err ' + err);
    }
    else {
      console.log(results + ' bytes sent');
    }
  });
  resetState = false;
  takeState  = false;
  sizeState  = false;
  readState  = true;
}

function reload() {
  resetState = true;
  takeState  = false;
  sizeState  = false;
  readState  = false;
  returnedSize = new Array();
  returnedImage = new Array();
  returnedReset = new Array();
}
