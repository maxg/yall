var connect = require('connect');
var crypto = require('crypto');
var express = require('express');
var fs = require('fs');
var http = require('http');
var https = require('https');
var jade = require('jade');
var jade_browser = require('jade-browser');
var path = require('path');
var socket = require('socket.io');

var strcluster = require('./strcluster');
var rooms = require('./rooms');

var app = express();
var cookies = express.cookieParser('secret'); // XXX how secret?
var sessions = new connect.session.MemoryStore();
var appserver = https.createServer({
  key: fs.readFileSync('./ssl-private-key.pem'),
  cert: fs.readFileSync('./ssl-certificate.pem'),
  ca: [ fs.readFileSync('./ssl-ca.pem') ],
  requestCert: true,
  rejectUnauthorized: true
}, app);

app.set('views', __dirname + '/views');
app.set('view engine', 'jade');

app.use(express.logger());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.bodyParser());
app.use(cookies);
app.use(express.session({ key: 'session', store: sessions }));
app.use(jade_browser('/jade/templates.js', '*', { root: __dirname + '/views/client' }));

app.configure('development', function() {
  app.use(express.errorHandler());
});

var ioapp = express();
ioapp.use(express.logger());
var ioserver = https.createServer({
  key: fs.readFileSync('./ssl-private-key.pem'),
  cert: fs.readFileSync('./ssl-certificate.pem'),
  ca: [ fs.readFileSync('./ssl-ca.pem') ]
}, ioapp);
var io = socket.listen(ioserver);

io.set('authorization', function(req, accept) {
  cookies(req, {}, function(err) {
    if (err) {
      return accept(err, false);
    }
    sessions.get(req.signedCookies.session, function(err, session) {
      if (err || ! session) {
        return accept(err || 'No session', false);
      }
      req.session = session;
      accept(null, true);
    });
  });
});

app.get('*', function(req, res, next) {
  var cert = req.connection.getPeerCertificate();
  var username = cert.subject.emailAddress.toLowerCase();
  res.locals.user = req.session.user = {
    //// To fake different users from different browsers:
    //// username: md5(req.headers['user-agent']).substr(0,3) + username,
    username: username,
    gravatar: md5(username)
  };
  next();
});

function md5(text) {
  return crypto.createHash('md5').update(text).digest('hex');
}

app.get('/', function(req, res) {
  res.render('index');
});

app.get('/:room', function(req, res) {
  console.log('room', req.session);
  var room = rooms.setupRoom(req.params.room, req.session.user.username, io.sockets);
  res.render('room', {
    ioserver: [ req.host, ioserver.address().port ].join(':'),
    room: room,
    userIsOwner: room.hasOwner(req.session.user.username),
    owners: room.owners().map(function(username) { return {
      username: username,
      gravatar: md5(username)
    }; })
  });
});

io.on('connection', function(socket) {
  console.log('connection');
  var user = socket.handshake.session.user;
  var room;
  
  socket.on('join', function(data) {
    console.log('join', data, user);
    room = rooms.getRoom(data.room.substr(1)); // remove leading slash
    socket.join(data.room);
    socket.emit('ask', room.question);
    socket.emit('winners', room.winners);
  });
  
  socket.on('question', function(data) {
    if ( ! room) { return; }
    if ( ! room.hasOwner(user.username)) { return; }
    console.log('question', room, data);
    
    room.ask(data.text);
  });
  
  socket.on('answer', function(data) {
    if ( ! room) { return; }
    console.log('answer', room, data);
    
    data.gravatar = user.gravatar;
    room.put(user.username, data);
    
    //// To add sock puppets:
    //// setTimeout(function() {
    ////   room.put('rcm@mit.edu', { text: data.text, gravatar: md5('rcm@mit.edu') });
    //// }, 4000 * Math.random());
  });
});

appserver.listen(process.env.PORT || 4443, function() {
  console.log('Express server listening on port %d in %s mode', appserver.address().port, app.settings.env);
});
ioserver.listen(process.env.SOCK_PORT || 4444, function() {
  console.log('Socket.IO server listening on port %d', ioserver.address().port);
});
