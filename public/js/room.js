function debounce(fn, wait) {
  var timeout;
  return function() {
    var self = this, args = arguments;
    if (timeout) { clearTimeout(timeout); }
    timeout = setTimeout(function() {
      timeout = null;
      fn.apply(self, args);
    }, wait);
  };
};

var socket = io.connect(ioserver);
socket.on('connect', function() {
  // console.log('connect');
  socket.emit('join', { room: window.location.pathname });
});

$('textarea#question').keyup(debounce(function() {
  //console.log('question', $(this).val());
  socket.emit('question', { text: $(this).val() });
}, 250));
$('textarea#answer').keyup(debounce(function() {
  // console.log('answer', $(this).val());
  socket.emit('answer', { text: $(this).val() });
}, 500));

socket.on('ask', function(question) {
  // console.log('ask', question);
  if (question) {
    $('p#question').text(question);
  } else {
    $('p#question').html('<i>No question yet...</i>');
  }
});
socket.on('winners', function(winners) {
  // console.log('winners', winners);
  $('#winners').html(jade.render('winners', { winners: winners }));
});
