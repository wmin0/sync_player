var app = require('http').createServer(handler)
  , io = require('socket.io').listen(app)
  , fs = require('fs')

app.listen(3000);

function handler (req, res) {
  console.log(req.url);
  var path;
  if ('/server' == req.url) {
    path = __dirname + '/server.html';
  } else if ('/client' == req.url) {
    path = __dirname + '/client.html';
  } else {
    path = __dirname + '/404.html';
  }
  fs.readFile(path, function (err, data) {
    if (err) {
      res.writeHead(500);
      return res.end('Error loading data');
    }
    res.writeHead(200);
    res.end(data);
  });
}

// app start

// structure
function VedioService (key, url, sock) {
  this.key = key;
  this.url = url;
  this.server = sock;
  this.clients = {};
  this.state = 0;
  this.sec = 0;
}

VedioService.prototype.getSyncObj = function() {
  return {
    'state': this.state,
    'sec': this.sec
  };
}

// util functions
function genRandomKey() {
  return Math.round(Math.random() * 1000000000);
}

function len(map) {
  var i = 0;
  for (j in map) {
    ++i;
  }
  return i;
}

// var
// key: obj
var serviceMap = {};
// sock.id: key
var serviceMapInv = {};
// sock.id: key
var clientMapInv = {};

// action functions
function onServerRequest(sock, data) {
  console.log('onServerRequest', sock.id, data);
  console.log(serviceMapInv[sock.id]);
  // only one service
  if (serviceMapInv[sock.id]) {
    console.log('emit err');
    sock.emit('serverError', {
      'msg': 'multi service'
    });
    return;
  }
  console.log('genKey');
  var key = genRandomKey();
  while (serviceMap[key]) {
    key = genRandomKey();
  }
  console.log('genKey done');
  var service = new VedioService(key, data.url, sock);
  serviceMap[key] = service;
  serviceMapInv[sock.id] = key;
  console.log('emit ack');
  sock.emit('serverRequestAck', {
    'url': data.url,
    'key': key
  });
}

function onClientRequest(sock, data) {
  console.log('onClientRequest', sock.id, data);
  // only on service
  if (clientMapInv[sock.id]) {
    sock.emit('clientError', {
      'msg': 'multi service'
    });
    return;
  }
  if (!serviceMap[data.key]) {
    sock.emit('clientError', {
      'msg': 'error key'
    });
    return;
  }
  var obj = serviceMap[data.key];
  obj.clients[sock.id] = sock;
  clientMapInv[sock.id] = data.key;
  sock.emit('clientRequestAck', {
    'url': obj.url,
  });
}

function onServerSyncRequest(sock, data) {
  if (!serviceMapInv[sock.id]) {
    sock.emit('serverError', {
      'msg': 'no service'
    });
    return;
  }
  var key = serviceMapInv[sock.id];
  var obj = serviceMap[key];
  obj.state = data.state;
  obj.sec = data.sec;
  var syncObj = obj.getSyncObj();
  for (id in obj.clients) {
    var client = obj.clients[id];
    client.emit('clientSync', syncObj);
  }
}

function onClientSyncRequest(sock, data) {
  if (!clientMapInv[sock.id]) {
    sock.emit('clientError', {
      'msg': 'no connect service'
    });
    return;
  }
  var key = clientMapInv[sock.id];
  var obj = serviceMap[key];
  sock.emit('clientSync', obj.getSyncObj());
}

function onDisconnect(sock, data) {
  if (serviceMapInv[sock.id]) {
    var key = serviceMapInv[sock.id];
    var obj = serviceMap[key];
    for (id in obj.clients) {
      var client = obj.clients[id];
      client.emit('serverClose', {});
      delete clientMapInv[client.id];
    }
    delete serviceMap[key];
    delete serviceMapInv[sock.id];
  }
  if (clientMapInv[sock.id]) {
    var key = clientMapInv[sock.id];
    var obj = serviceMap[key];
    delete obj.clients[sock.id];
    delete clientMapInv[sock.id];
  }
}

// action
io.sockets.on('connection', function(socket) {
  socket.on('serverRequest', function(data) {
    onServerRequest(socket, data);
  });
  socket.on('clientRequest', function(data) {
    onClientRequest(socket, data);
  });
  socket.on('serverSyncRequest', function(data) {
    onServerSyncRequest(socket, data);
  });
  socket.on('clientSyncRequest', function(data) {
    onClientSyncRequest(socket, data);
  });
  socket.on('disconnect', function() {
    onDisconnect(socket);
  });
});
