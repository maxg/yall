var events = require('events');
var fork = require('child_process').fork;

var logger = require('./room-logger');

const rooms = {};

exports.setupRoom = function(name, username, sockets) {
  if (rooms.hasOwnProperty(name)) {
    return rooms[name];
  }
  
  var room = rooms[name] = createRoom(name);
  room.addOwner(username);
  room.on('winners', function() {
    sockets.in('/' + name).emit('winners', room.state, room.visibleWinners());
    sockets.in('/' + name + '#owners').emit('winners#owners', room.state, room.hiddenWinners());
  });
  room.on('ask', function(question) {
    sockets.in('/' + name).emit('ask', question);
  });
  room.on('reset', function() {
    sockets.in('/' + name).emit('reset', room.state);
  });
  return room;
}

exports.getRoom = function(name) {
  return rooms[name];
};

function createRoom(name) {
  var child = fork('./room-worker');
  var emitter = new events.EventEmitter();
  var owners = {};
  var log = logger.log(name);
  
  emitter.name = name;
  emitter.settings = { reveal: false };
  emitter.state = { revealed: false };
  emitter.question = '';
  var winners = {
    raw: [],
    revealed: [],
    redacted: []
  };
  
  emitter.addOwner = function(username) {
    owners[username] = true;
  };
  emitter.owners = function() {
    return Object.keys(owners);
  };
  emitter.hasOwner = function(username) {
    return owners.hasOwnProperty(username);
  };
  
  emitter.ask = function(text) {
    log.info({ question: text }, 'question');
    emitter.question = text;
    emitter.emit('ask', text);
  };
  emitter.put = function(key, val) {
    log.info({ username: key, answer: val.text }, 'answer');
    child.send({ put: key, val: val });
  };
  
  emitter.visibleWinners = function() {
    return emitter.settings.reveal || emitter.state.revealed ? winners.revealed : winners.redacted
  };
  emitter.hiddenWinners = function() {
    return winners.revealed;
  };
  
  emitter.reveal = function() {
    if ( ! (emitter.settings.reveal || emitter.state.revealed)) {
      log.info('reveal');
      emitter.state.revealed = true;
      emitter.emit('winners');
    }
  };
  emitter.reset = function() {
    log.info('reset');
    emitter.state.revealed = false;
    emitter.question = '';
    winners.revealed = [];
    winners.redacted = [];
    child.send({ reset: true });
    emitter.emit('reset');
  };
  
  child.on('message', function(msg) {
    if (msg.winners) { // XXX and the new winners are different?
      log.info({
        clusters: msg.winners.map(function(winner) {
          return { label: winner.label, size: winner.size };
        })
      }, 'clusters');
      winners.raw = msg.winners;
      winners.revealed = msg.winners.map(function(winner) {
        return {
          label: winner.label,
          gravatars: winner.items.map(function(item) { return item.gravatar; })
        }
      });
      winners.redacted = msg.winners.map(function(winner) {
        var chunks = Math.ceil(winner.label.length/winner.label.split(/\s+/).length);
        var dots = winner.label.replace(/\s/g, '').replace(/./g, '\u2022');
        return {
          label: dots.replace(new RegExp('.{' + chunks + '}', 'g'), '$& '),
          gravatars: winner.items.map(function(item) { return item.gravatar; })
        };
      });
      emitter.emit('winners');
    }
  });
  
  return emitter;
};

if (require.main === module) {
  var room = createRoom('main');
  
  room.on('winners', function() {
    console.log('the winners are', room.hiddenWinners());
  });
  
  room.put('alice', { text: 'something', gravatar: 'alice' });
  room.put('bob', { text: 'something', gravatar: 'bob' });
  room.put('carol', { text: 'else', gravatar: 'carol' });
  room.put('dan', { text: 'else', gravatar: 'dan' });
  room.put('eve', { text: 'something', gravatar: 'eve' });
  room.put('frank', { text: 'something?', gravatar: 'frank' });
}
