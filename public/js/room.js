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
  socket.emit('join', { room: window.location.pathname });
});

$('textarea#question').keyup(debounce(function() {
  socket.emit('question', { text: $(this).val() });
}, 250));
$('textarea#answer').keyup(debounce(function() {
  $('#save .start').fadeIn();
  socket.emit('answer', { text: $(this).val().substring(0, 100) }, function() {
    $('#save .start').hide();
    $('#save .done').show().delay(2000).fadeOut();
  });
}, 500));

$('#controls').on('click', '#reveal', function() {
  try { socket.emit('reveal'); } finally { return false; }
});
$('#controls').on('click', '#archive', function() {
  try { socket.emit('archive'); } finally { return false; }
});

function ask(question) {
  if (question) {
    $('p#question').text(question);
  } else {
    $('p#question').html('<i>No question yet...</i>');
  }
}
socket.on('ask', ask);

function update(state, winners) {
  if (userIsOwner) {
    $('#controls').html(jade.render('controls', { state: state }));
  }
  $('#winners').html(jade.render('winners', { winners: winners }));
}
socket.on(userIsOwner ? 'winners#owners' : 'winners', update);

function reset(state) {
  ask('');
  update(state, []);
  $('textarea#question').val('');
  $('textarea#answer').val('');
  $('#save span').hide();
}
socket.on('reset', reset);
