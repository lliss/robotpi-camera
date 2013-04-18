var SerialPort = require('serialport').SerialPort;
var serialPort = new SerialPort('/dev/ttyAMA0', {
  baudrate: 38400
});
var fs = require('fs');
var http = require('http');

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

// Return data expectations.
var takeReturn = new Buffer([118, 00, 54, 00, 00]);
var sizeReturn = new Buffer([118, 00, 52, 00, 04, 00, 00]);
var readReturn = new Buffer([118, 00, 50, 00, 00]);
var resetReturn = [118, 00, 38, 00];
var returnedReset = new Array();
var returnedSize = new Array();
var returnedImage = new Array();


var buf = new Buffer(0);
fs.writeFile('image.jpg', buf, function (err) {
  if (err) throw err;
});

serialPort.open(function () {
  console.log('open');
  snapIt();
});

serialPort.on('data', function(data) {
  var newData = data.toJSON();
  if (resetState) {
    returnedReset = returnedReset.concat(newData);
    console.log('got it');
    console.log(returnedReset.length);
    if (
      returnedReset[0] == 118 &&
      returnedReset[1] == 0   &&
      returnedReset[2] == 38  &&
      returnedReset[3] == 0   &&
      returnedReset.length == 71
    ) {
      console.log('yay got it');
      triggerShutter();
    }
  }
  if (sizeState) {
    returnedSize = returnedSize.concat(newData);
    if (returnedSize.length == 9) {
      console.log(returnedSize);
      var mem1 = returnedSize[7];
      var mem2 = returnedSize[8];
      console.log(mem1);
      console.log(mem2);
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
      console.log(image);
      fs.appendFile('image.jpg', image, function (err) {
        if (err) throw err;
      });
    }
  }
  if (data.toString() == takeReturn.toString() && takeState) {
    getSize();
  }
});

function snapIt() {
  console.log('reset');
  serialPort.write(resetCommand, function(err, results) {
    console.log('err ' + err);
    console.log('results ' + results);
  });
  resetState = true;
  takeState  = false;
  sizeState  = false;
  readState  = false;
}

function triggerShutter() {
  console.log('take picture');
  serialPort.write(takePic, function(err, results) {
    console.log('err ' + err);
    console.log('results ' + results);
  });
  resetState = false;
  takeState  = true;
  sizeState  = false;
  readState  = false;
}

function getSize() {
  console.log('getting size');
  console.log(readSize)
  serialPort.write(readSize, function(err, results) {
    console.log('err ' + err);
    console.log('results ' + results);
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
  console.log(readPic);
  serialPort.write(readPic, function(err, results) {
    console.log('err ' + err);
    console.log('results ' + results);
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
}
