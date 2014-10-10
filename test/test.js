var createStatic = require('..');
var path = require('path');
var assert = require('assert');
var StreamSink = require('streamsink');

var dir = path.join(__dirname, "public");

createStatic({dir: dir}, function(err, middleware) {
  if (err) throw err;

  var tests = [
    {
      name: "basic",
      fn: testFooTxt,
    },
    {
      name: "symlink-dir",
      fn: testSymlinkDir,
    },
    {
      name: "symlink",
      fn: testSymlink,
    },
  ];

  testOne();

  function testOne() {
    var test = tests.shift();
    if (!test) {
      process.stdout.write("done\n");
      return;
    }
    process.stdout.write("testing " + test.name + "...");
    test.fn(function(err) {
      if (err) throw err;
      process.stdout.write("OK\n");
      testOne();
    });
  }

  function testSymlink(cb) {
    var sink = new StreamSink();
    sink.on('finish', function() {
      assert.strictEqual(sink.toString(), "aoeu1234\n")
      cb();
    });
    sink.setHeader = function(name, val) {};
    middleware({
      url: '/bar.txt',
      headers: {},
    }, sink, function(err) {
      throw new Error("unexpected call: " + err);
    });
  }

  function testSymlinkDir(cb) {
    var sink = new StreamSink();
    sink.on('finish', function() {
      assert.strictEqual(sink.toString(), "zzzz\n")
      cb();
    });
    sink.setHeader = function(name, val) {};
    middleware({
      url: '/dir/blah.txt',
      headers: {},
    }, sink, function(err) {
      throw new Error("unexpected call: " + err);
    })
  }

  function testFooTxt(cb) {
    middleware({url: '/unrelated'}, null, function() {
      var sink = new StreamSink();
      sink.on('finish', function() {
        assert.strictEqual(sink.toString(), "hi\n")
        cb();
      });
      sink.setHeader = function(name, val) {};
      middleware({
        url: '/foo.txt',
        headers: {},
      }, sink, assert.fail)
    });
  }
});
