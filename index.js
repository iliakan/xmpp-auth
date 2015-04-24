#!/usr/bin/env node

// protocol @see https://www.ejabberd.im/files/doc/dev.html#htoc9
var async = require('async');
var bunyan = require('bunyan');
var config = require('./config');

var log = bunyan.createLogger({
  level:   'debug',
  name:    "auth",
  streams: [{
    level: 'trace',
    path:  '/var/log/ejabberd/xmpp-auth.log'
  }]

});

process.stdin.on('readable', function read() {
  log.info("readable");
  var offset = 0;
  var buf = process.stdin.read();
  if (!buf) return;

  log.info("buffer", buf, buf.toString());

  while (true) {
    // offset is the current message start
    if (buf.length < offset + 2) {
      process.stdin.unshift(buf.slice(offset));
      return;
    }

    var messageLength = buf.readUInt16BE(offset);

    log.info("length", messageLength);

    if (offset + 2 + messageLength < buf.length) {
      process.stdin.unshift(buf.slice(offset));
      return;
    }

    offset += 2;
    // message example: "auth:iliakan:x.javascript.ru:password"
    var message = buf.slice(offset, messageLength + offset);
    offset += messageLength;

    message = message.toString();
    log.info("message", message);

    message = message.split(':');

    /*
     Messages:
     auth:User:Server:Password (check if a username/password pair is correct)
     isuser:User:Server (check if it’s a valid user)
     setpass:User:Server:Password (set user’s password)
     tryregister:User:Server:Password (try to register an account)
     removeuser:User:Server (remove this account)
     removeuser3:User:Server:Password (remove this account if the password is correct)
     */
    messageQueue.push({
      command:  message[0],
      user:     message[1],
      server:   message[2],
      password: message[3] // may be undefined
    });

  }

});


var messageQueue = async.queue(function(message, callback) {
  request.post({
    url:  config.authServiceUrl,
    form: message
  }, function(err, httpResponse, body) {
    if (err) throw(err);

    switch(body) {
    case "1":
      respond(true);
      callback();
      break;
    case "0":
      respond(false);
      callback();
      break;
    default:
      log.error("Invalid response (must be 1 or 0)", body, httpResponse);
      throw new Error("Invalid response");
    }
  });
}, 1);

function respond(ok) {
  process.stdout.write(new Buffer([0, 2, 0, ok ? 1 : 0]));
}


// using uncaughtException is bad m'kay
// make sure log is flushed!
// @see https://github.com/trentm/node-bunyan/issues/37#issue-6439571
process.on('uncaughtException', function flush(err) {
  // prevent infinite recursion
  process.removeListener('uncaughtException', flush);

  // bonus: log the exception
  log.error(err);

  if (typeof(log.streams[0]) !== 'object') return;

  // throw the original exception once stream is closed
  log.streams[0].stream.on('close', function(streamErr, stream) {
    throw err;
  });

  // close stream, flush buffer to disk
  log.streams[0].stream.end();
});



