var zlib = require('zlib');
var fs = require('fs');
var stream = require('stream');
var util = require('util');
var path = require('path');
var Pend = require('pend');
var findit = require('findit2');
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
  var followSymlinks = (options.followSymlinks == null) ? true : !!options.followSymlinks;
  var cacheControlHeader = options.cacheControlHeader || 'max-age=0, must-revalidate';

  var cache = {};
  var pend = new Pend();
  var walker = findit(dir, {followSymlinks: followSymlinks});
  walker.on('error', function(err) {
    walker.stop();
    cb(err);
  });
  walker.on('file', function(file, stat, linkPath) {
    var usePath = linkPath || file;
    if (ignoreFile(usePath)) return;
    var relName = '/' + path.relative(dir, usePath).replace(/\\/g, '/');
    var compressedSink = new StreamSink();
    var uncompressedSink = new StreamSink();
    var hashSink = new StreamSink();
    var inStream = fs.createReadStream(file);
    var cacheObj;
    cache[relName] = cacheObj = {
      sink: null,
      mime: mime.lookup(relName),
      mtime: stat.mtime,
      hash: null,
      compressed: null,
    };
    var fileDone = pend.hold();
    var thisPend = new Pend();
    var gzipPendCb = thisPend.hold();
    var hashPendCb = thisPend.hold();
    var uncompressedPendCb = thisPend.hold();
    inStream.on('error', function(err) {
      if (err.code === 'EISDIR') {
        delete cache[relName];
        gzipPendCb();
        uncompressedPendCb();
        hashPendCb();
      } else {
        walker.stop();
        gzipPendCb(err);
        uncompressedPendCb(err);
        hashPendCb(err);
      }
    });
    inStream.pipe(zlib.createGzip()).pipe(compressedSink);
    compressedSink.on('finish', gzipPendCb);
    inStream.pipe(uncompressedSink);
    uncompressedSink.on('finish', uncompressedPendCb);
    inStream.pipe(crypto.createHash('sha1')).pipe(hashSink);
    hashSink.on('finish', function() {
      cacheObj.hash = hashSink.toString('base64');
      hashPendCb();
    });
    thisPend.wait(function(err) {
      if (err) return fileDone(err);
      var compressionRatio = compressedSink.length / uncompressedSink.length;
      if (compressionRatio >= 0.95) {
        // 95% of original size or worse. discard compressed sink
        cacheObj.sink = uncompressedSink;
        cacheObj.compressed = false;
      } else {
        // better than 95% of original size. discard uncompressed sink
        cacheObj.sink = compressedSink;
        cacheObj.compressed = true;
      }
      fileDone();
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
      resp.setHeader('Cache-Control', cacheControlHeader);
      resp.setHeader('ETag', c.hash);
      if (req.headers['accept-encoding'] == null) {
        if (c.compressed) {
          sink.createReadStream().pipe(zlib.createGunzip()).pipe(resp);
        } else {
          sink.createReadStream().pipe(resp);
        }
      } else {
        if (c.compressed) {
          resp.setHeader('Content-Encoding', 'gzip');
        }
        sink.createReadStream().pipe(resp);
      }
    }
  });
}

function defaultIgnoreFile(file) {
  var basename = path.basename(file);
  return /^\./.test(basename) || /~$/.test(basename);
}
