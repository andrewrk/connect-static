var createStatic = require('..');
var path = require('path');
var assert = require('assert');
var StreamSink = require('streamsink');

var dir = path.join(__dirname, "public");

createStatic({dir: dir}, function(err, middleware) {
  if (err) throw err;
  middleware({url: '/unrelated'}, null, function() {
    var sink = new StreamSink();
    sink.on('finish', function() {
      assert.strictEqual(sink.toString(), "hi\n")
      console.log("OK");
    });
    sink.setHeader = function(name, val) {};
    middleware({
      url: '/foo.txt',
      headers: {},
    }, sink, assert.fail)
  });
});
