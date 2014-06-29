var createStatic = require('..');
var path = require('path');
var assert = require('assert');
var BufferList = require('bl');

var dir = path.join(__dirname, "public");

createStatic({dir: dir}, function(err, middleware) {
  if (err) throw err;
  middleware({url: '/unrelated'}, null, function() {
    var bl = new BufferList();
    bl.on('finish', function() {
      assert.strictEqual(bl._bufs[0].toString(), "hi\n")
      console.log("OK");
    });
    bl.setHeader = function(name, val) {};
    middleware({
      url: '/foo.txt',
      headers: {},
    }, bl, assert.fail)
  });
});
