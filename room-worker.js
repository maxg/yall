var async = require('async');

var strcluster = require('./strcluster');

function content(x) { return x.text; }

var cluster = strcluster.cluster(content);

var dict = {};

var queue = async.queue(function(_, next) {
  if (queue.length() > 0) {
    return next();
  }
  
  var tree = cluster(Object.keys(dict).map(function(key) {
    return dict[key];
  }));
  if (tree) {
    process.send({ winners: strcluster.winners(tree) });
  }
  next();
}, 1);

function put(key, val) {
  if (dict.hasOwnProperty(key) && content(dict[key]) == content(val)) { return; }
  dict[key] = val;
  process.nextTick(function() { queue.push(true); });
}

process.on('message', function(msg) {
  console.log('msg', msg);
  if (msg.put) {
    put(msg.put, msg.val);
  }
});
