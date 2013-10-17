var events = require('events');
var fork = require('child_process').fork;

const rooms = {};

exports.setupRoom = function(name, username, sockets) {
  if (rooms.hasOwnProperty(name)) {
    return rooms[name];
  }
  
  var room = rooms[name] = createRoom(name);
  room.addOwner(username);
  room.on('winners', function(winners) {
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
    emitter.question = text;
    emitter.emit('ask', text);
  }
  emitter.put = function(key, val) {
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
      emitter.state.revealed = true;
      emitter.emit('winners');
    }
  };
  emitter.reset = function() {
    emitter.state.revealed = false;
    emitter.question = '';
    winners.revealed = [];
    winners.redacted = [];
    emitter.emit('reset');
  };
  
  child.on('message', function(msg) {
    if (msg.winners) { // XXX and the new winners are different?
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
  
  room.on('winners', function(winners) {
    console.log('the winners are', winners);
  });
  
  room.put('maxg', { text: 'something', username: 'maxg' });
  room.put('glittle', { text: 'something', username: 'glittle' });
  room.put('a', { text: 'else', username: 'glittle' });
  room.put('b', { text: 'else', username: 'glittle' });
  room.put('kp', { text: 'something', username: 'kp' });
  room.put('rcm', { text: 'something?', username: 'rcm' });
}
