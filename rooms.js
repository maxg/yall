var events = require('events');
var fork = require('child_process').fork;

const rooms = {};

exports.setupRoom = function(name, username, sockets) {
  console.log('setupRoom', name, username);
  if (rooms.hasOwnProperty(name)) {
    return rooms[name];
  }
  
  var room = rooms[name] = createRoom(name);
  room.addOwner(username);
  room.on('winners', function(winners) {
    sockets.in('/' + name).emit('winners', winners);
  });
  room.on('ask', function(question) {
    sockets.in('/' + name).emit('ask', question);
  });
  return room;
}

exports.getRoom = function(name) {
  console.log('getRoom', name);
  return rooms[name];
};

function createRoom(name) {
  var child = fork('./room-worker');
  var emitter = new events.EventEmitter();
  var owners = {};
  
  emitter.name = name;
  emitter.question = '';
  emitter.winners = [];
  
  emitter.addOwner = function(username) {
    console.log('addOwner', username);
    owners[username] = true;
  };
  emitter.owners = function() {
    console.log('owners are', owners);
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
    console.log('put', key, val);
    child.send({ put: key, val: val });
  };
  
  child.on('message', function(msg) {
    if (msg.winners) { // XXX and the new winners are different?
      emitter.winners = msg.winners;
      emitter.emit('winners', msg.winners);
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
