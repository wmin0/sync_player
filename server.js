var app = require('http').createServer(handler)
  , io = require('socket.io').listen(app)
  , fs = require('fs')

app.listen(3000);

function handler (req, res) {
  console.log(req.url);
  var path = __dirname + req.url;
  fs.readFile(path, function (err, data) {
    if (err) {
      path = __dirname + '/404.html';
      fs.readFile(path, function (err2, data2) {
        if (err2) {
          res.writeHead(500);
          res.end('error load data');
        } else {
          res.writeHead(404);
          res.end(data2);
        }
      });
    } else {
      res.writeHead(200);
      res.end(data);
    }
  });
}

// app start

// structure
function VedioService(key, url, sock) {
  this.key = key;
  this.url = url;
  this.server = sock;
  this.title = '';
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

function UserData(name, color) {
  this.name = name;
  this.color = color;
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

function buildMsg(id, text) {
  var obj = nameMap[id];
  if (!obj) {
    return undefined;
  }
  return {
    'text': obj.name + ": " + text,
    'color': obj.color
  }
}

// var
// key: obj
var serviceMap = {};
// sock.id: key
var serviceMapInv = {};
// sock.id: key
var clientMapInv = {};
// sock.id: name
var nameMap = {};

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
    'title': obj.title
  });
  var msg = buildMsg(sock.id, "enter the room!!");
  for (id in obj.clients) {
    var client = obj.clients[id];
    client.emit('showMsg', msg);
  }
  obj.server.emit('showMsg', msg);

  // build list to new commer
  var listMsg = buildMsg(obj.server.id, 'in room!!');
  sock.emit('showMsg', listMsg);
  for (id in obj.clients) {
    if (id == sock.id) {
      continue;
    }
    listMsg = buildMsg(id, "in room!!");
    sock.emit('showMsg', listMsg);
  }
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
  obj.server.emit('syncPlayerState', {});
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
    var msg = buildMsg(sock.id, "leave the room!!");
    for (id in obj.clients) {
      var client = obj.clients[id];
      client.emit('showMsg', msg);
    }
    obj.server.emit('showMsg', msg);
  }
  if (nameMap[sock.id]) {
    delete nameMap[sock.id];
  }
}

function onRegUser(sock, data) {
  if (!nameMap[sock.id]) {
    nameMap[sock.id] = new UserData(data.name, data.color);
  } else {
    nameMap[sock.id].color = data.color;
  }
}

function onSendMsg(sock, data) {
  var msg = buildMsg(sock.id, data.text);
  if (!msg) {
    return;
  }
  var key = serviceMapInv[sock.id] || clientMapInv[sock.id];
  if (!key) {
    return;
  }
  var obj = serviceMap[key];
  obj.server.emit('showMsg', msg);
  for (id in obj.clients) {
    var client = obj.clients[id];
    client.emit('showMsg', msg);
  }
}

function onServerUpdate(sock, data) {
  if (!serviceMapInv[sock.id]) {
    sock.emit('serverError', {
      'msg': 'no service'
    });
    return;
  }
  var key = serviceMapInv[sock.id];
  var obj = serviceMap[key];
  obj.title = data.title;
  var updateObj = {
    'title': data.title
  };
  for (id in obj.clients) {
    var client = obj.clients[id];
    client.emit('serverUpdate', updateObj);
  }
}

// action
io.sockets.on('connection', function(socket) {
  socket.on('regUser', function(data) {
    onRegUser(socket, data);
  });
  socket.on('sendMsg', function(data) {
    onSendMsg(socket, data);
  });
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
  socket.on('serverUpdate', function(data) {
    onServerUpdate(socket, data);
  });
  socket.on('disconnect', function() {
    onDisconnect(socket);
  });
});
