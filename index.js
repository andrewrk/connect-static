var zlib = require('zlib');
var fs = require('fs');
var stream = require('stream');
var util = require('util');
var path = require('path');
var Pend = require('pend');
var findit = require('findit');
var mime = require('mime');
var StreamSink = require('streamsink');

module.exports = createGzipStaticMiddleware;

function createGzipStaticMiddleware(options, cb) {
  options = options || {};
  var dir = options.dir || "public";
  var ignoreFile = options.ignoreFile || defaultIgnoreFile;
  var aliases = options.aliases || [['/', '/index.html']];

  var cache = {};
  var pend = new Pend();
  var walker = findit(dir);
  walker.on('file', function(file) {
    if (ignoreFile(file)) return;
    var relName = '/' + path.relative(dir, file);
    var sink = new StreamSink();
    var inStream = fs.createReadStream(file);
    inStream.on('error', function(err) {
      if (err.code === 'EISDIR') {
        delete cache[relName];
        return;
      } else {
        throw err;
      }
    });
    cache[relName] = {
      sink: sink,
      mime: mime.lookup(relName),
    };
    pend.go(function(cb) {
      inStream.pipe(zlib.createGzip()).pipe(sink);
      sink.once('finish', cb);
    });
  });
  walker.on('end', function() {
    pend.wait(function(err) {
      if (err) return cb(err);
      aliases.forEach(function(alias) {
        cache[alias[0]] = cache[alias[1]];
      });
      cb(null, middleware);
    });
    function middleware(req, resp, next) {
      var c = cache[req.url];
      if (!c) return next();
      var sink = c.sink;
      resp.setHeader('Content-Type', c.mime);
      if (req.headers['accept-encoding'] == null) {
        sink.createReadStream().pipe(zlib.createGunzip()).pipe(resp);
      } else {
        resp.setHeader('content-encoding', 'gzip');
        sink.createReadStream().pipe(resp);
      }
    }
  });
}

function defaultIgnoreFile(file) {
  var basename = path.basename(file);
  return /^\./.test(basename) || /~$/.test(basename);
}
