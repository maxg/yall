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

var config = require('./config');
var strcluster = require('./strcluster');
var rooms = require('./rooms');

var app = express();
var cookies = express.cookieParser(crypto.randomBytes(32).toString('base64'));
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

io.set('log level', 1);

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

app.param('room', function(req, res, next, room) {
  if (room.match(/^\w[\w.-]*$/)) { next(); } else { next('route'); }
});

app.get('*', function(req, res, next) {
  var cert = req.connection.getPeerCertificate();
  var username = cert.subject.emailAddress.toLowerCase();
  res.locals.user = req.session.user = {
    username: (config.web.debugUserFakery
      ? username.replace('@', '+' + md5(req.headers['user-agent']).substr(0,3) + '@')
      : username),
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

app.get('/:room/settings', function(req, res) {
  var room = rooms.getRoom(req.params.room);
  if ( ! room) { return res.status(404).render('error', { title: 'No such room' }); }
  if ( ! room.hasOwner(req.session.user.username)) {
    return res.render('error', { title: 'Permission denied' });
  }
  res.render('settings', {
    room: room,
    owners: room.owners().map(function(username) { return {
      username: username,
      gravatar: md5(username)
    }; })
  });
});

app.post('/:room/settings', function(req, res) {
  var room = rooms.getRoom(req.params.room);
  if ( ! room) { return res.status(404).render('error', { title: 'No such room' }); }
  if ( ! room.hasOwner(req.session.user.username)) {
    return res.render('error', { title: 'Permission denied' });
  }
  room.state.reveal = req.body.reveal == 'true';
  res.redirect(req.path);
});

io.on('connection', function(socket) {
  var user = socket.handshake.session.user;
  var room;
  
  socket.on('join', function(data) {
    room = rooms.getRoom(data.room.substr(1)); // remove leading slash
    socket.join(data.room);
    socket.emit('ask', room.question);
    socket.emit('winners', room.state, room.visibleWinners());
    if (room.hasOwner(user.username)) {
      socket.join(data.room + '#owners');
      socket.emit('winners#owners', room.state, room.hiddenWinners());
    }
  });
  
  socket.on('question', function(data) {
    if ( ! room) { return; }
    if ( ! room.hasOwner(user.username)) { return; }
    
    room.ask(data.text);
  });
  
  socket.on('answer', function(data, ack) {
    if ( ! room) { return; }
    
    if (room.state.revealed && ! room.state.reveal) { return; }
    
    data.gravatar = user.gravatar;
    room.put(user.username, data);
    ack();
    
    if (config.web.debugSockPuppets) {
      config.web.debugSockPuppets.forEach(function(username) {
        setTimeout(function() {
          room.put(username, { text: data.text, gravatar: md5(username) });
        }, 4000 * Math.random());
      });
    }
  });
  
  socket.on('reveal', function() {
    if ( ! room) { return; }
    if ( ! room.hasOwner(user.username)) { return; }
    
    room.reveal();
  });
  
  socket.on('archive', function() {
    if ( ! room) { return; }
    if ( ! room.hasOwner(user.username)) { return; }
    
    // TODO archive question and answers
    room.reset();
  });
});

appserver.listen(config.web.https, function() {
  console.log('Express server listening on port %d in %s mode', appserver.address().port, app.settings.env);
});
ioserver.listen(config.web.share, function() {
  console.log('Socket.IO server listening on port %d', ioserver.address().port);
});
