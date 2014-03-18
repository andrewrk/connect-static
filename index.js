var zlib = require('zlib');
var fs = require('fs');
var stream = require('stream');
var util = require('util');
var path = require('path');
var Pend = require('pend');
var findit = require('findit');
var mime = require('mime');
var url = require('url');
var StreamSink = require('streamsink');
var crypto = require('crypto');

module.exports = createGzipStaticMiddleware;

function createGzipStaticMiddleware(options, cb) {
  options = options || {};
  var dir = options.dir || "public";
  var ignoreFile = options.ignoreFile || defaultIgnoreFile;
  var aliases = options.aliases || [['/', '/index.html']];

  var cache = {};
  var pend = new Pend();
  var walker = findit(dir);
  walker.on('file', function(file, stat) {
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
    var cacheObj;
    cache[relName] = cacheObj = {
      sink: sink,
      mime: mime.lookup(relName),
      mtime: stat.mtime,
      hash: null,
    };
    pend.go(function(cb) {
      inStream.pipe(zlib.createGzip()).pipe(sink);
      sink.once('finish', cb);
    });
    pend.go(function(cb) {
      var hashSink = new StreamSink();
      inStream.pipe(crypto.createHash('sha1')).pipe(hashSink);
      hashSink.once('finish', function() {
        cacheObj.hash = hashSink.toString('base64');
        cb();
      });
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
      var parsedUrl = url.parse(req.url);
      var c = cache[parsedUrl.pathname];
      if (!c) return next();
      if (req.headers['if-none-match'] === c.hash) {
        resp.statusCode = 304;
        resp.end();
        return;
      }
      var ifModifiedSince = new Date(req.headers['if-modified-since']);
      if (!isNaN(ifModifiedSince) && c.mtime <= ifModifiedSince) {
        resp.statusCode = 304;
        resp.end();
        return;
      }

      var sink = c.sink;
      resp.setHeader('Content-Type', c.mime);
      resp.setHeader('ETag', c.hash);
      console.log(req.url, req.headers);
      if (req.headers['accept-encoding'] == null) {
        sink.createReadStream().pipe(zlib.createGunzip()).pipe(resp);
      } else {
        resp.setHeader('Content-Encoding', 'gzip');
        sink.createReadStream().pipe(resp);
      }
    }
  });
}

function defaultIgnoreFile(file) {
  var basename = path.basename(file);
  return /^\./.test(basename) || /~$/.test(basename);
}
