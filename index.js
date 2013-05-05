/**
 * @file
 * HTTP server to get images from a LinkSprite TTL Serial Camera.
 */

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
var serialReady  = false;
var takingPic = false;
var lastPic = 0;

// Return data expectations for comparision.
var takeReturn = new Buffer([118, 00, 54, 00, 00]);
var sizeReturn = new Buffer([118, 00, 52, 00, 04, 00, 00]);
var readReturn = new Buffer([118, 00, 50, 00, 00]);
var resetReturn = [118, 00, 38, 00];
var returnedReset = new Array();
var returnedSize = new Array();
var returnedImage = new Array();

// Prepare the server on 8881.
http.createServer(function(req, res) {
  var action = req.url;
  console.log(action);
  // Give the image upon request, strip off anthing after the filename since we
  // add cache-breakers to the request on the client side.
  if (action.substr(0, 10) == '/image.jpg') {
    console.log(action);
    var img = fs.readFileSync('./image.jpg');
    // Don't let the client's browser store the image. We need constantly
    // updated data.
    res.writeHead(200, {'Content-Type': 'image/jpeg', 'Cache-Control': 'no-cache, must-revalidate'});
    res.end(img, 'binary');
    // We set a timeout variable. Sometimes the program flow gets stuck. If this
    // has been the case for more than 7 seconds then reset the state.
    var time = new Date().getTime();
    if (time - lastPic > 7000) {
      reload();
      takingPic = false;
    }
    // Don't start a new flow if we are already taking a picture.
    if (!takingPic) {
      reload();
      snapIt();
    }
  }
  if (action == '/') {
    var indexPage = fs.readFileSync('./index.html');
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end(indexPage);
  }
}).listen(8881);

serialPort.open(function () {
  serialReady = true;
});

// On the data receive event decide what is happening based on the returned byte
// array and then more to next state as appropriate.
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
      triggerShutter();
    }
  }
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
      // Clear the previous image by filling the file with zero bytes.
      var buf = new Buffer(0);
      fs.writeFile('image.jpg', buf, function (err) {
        if (err) throw err;
      });
      // Write the new image to the file.
      fs.appendFile('image.jpg', image, function (err) {
        if (err) throw err;
      });
      // Reset the global state flag.
      takingPic = false;
    }
  }
  if (data.toString() == takeReturn.toString() && takeState) {
    getSize();
  }
});

/**
 * Start the process of taking a picture.
 */
function snapIt() {
  // Prevent interfereince by setting the global state flag.
  takingPic = true;
  console.log('reset');
  serialPort.write(resetCommand, function(err, results) {
    if (err) {
      console.log('err ' + err);
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

/**
 * Trigger the actual command to get a new image.
 */
function triggerShutter() {
  console.log('take picture');
  serialPort.write(takePic, function(err, results) {
    if (err) {
      console.log('err ' + err);
    }
    else {
      console.log(results + ' bytes sent');
    }
  });
  resetState = false;
  takeState  = true;
  sizeState  = false;
  readState  = false;
}

/**
 * Find the size of the taken image. We use this to read the memory cells.
 */
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

/**
 * Get the camera to return an image as data from memory space 1 through memory
 * space 2.
 */
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

/**
 * Return everything to the default state.
 */
function reload() {
  resetState = true;
  takeState  = false;
  sizeState  = false;
  readState  = false;
  returnedSize = new Array();
  returnedImage = new Array();
  returnedReset = new Array();
}
