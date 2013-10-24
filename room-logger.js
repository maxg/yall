var bunyan = require('bunyan');
var path = require('path');

exports.log = function(name) {
  return bunyan.createLogger({
    name: name,
    streams: [
      { path: path.join(__dirname, 'log', name.replace(/\W/g, '') + '.log') }
    ]
  });
};
