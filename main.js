var redis   = require('redis');
var multer  = require('multer');
var express = require('express');
var fs      = require('fs');
var httpProxy = require('http-proxy');
var http = require('http');

var app = express();
var client = redis.createClient(6379, '127.0.0.1', {});

client.exists('hosts', function(err, exists) {
  //delete previously stored hosts if they exist
  if (exists)
    client.del('hosts');
    // load server host/ports
    client.lpush( 'hosts', JSON.stringify({host: 'localhost', port: 3000}));
    client.lpush( 'hosts', JSON.stringify({host: 'localhost', port: 3001}));
    client.lpush( 'hosts', JSON.stringify({host: 'localhost', port: 3002}));
});

// Add hook to make it easier to get all visited URLS.
app.use(function(req, res, next)
{
  console.log(req.method, req.url);
  client.lpush('recent', req.url);
  client.ltrim('recent', 0, 4);
  next(); // Passing the request to the next handler in the stack.
});

app.get('/', function(req, res) {
  res.send('hello world');
});

app.get('/get', function(req, res) {
  client.get("foo", function(err, val) {
    val = (val) ? val : "No value set - try POST /set";
    res.send(val);
  });
});

app.post('/set', function(req, res) {
  var key = "foo";
  client.set(key, "this message will self-destruct in 10 seconds");
  client.expire(key, 10);
  res.send("key set!");
});

app.get('/recent', function(req, res) {
  client.lrange("recent", 0, 4, function(err, val) {res.send(val)});
})

app.post('/upload',[ multer({ dest: './uploads/'}), function(req, res) {
  console.log(req.body); // form fields
  console.log(req.files); // form files

  if( req.files.image )
  {
    fs.readFile( req.files.image.path, function (err, data) {
      if (err) throw err;
      var img = new Buffer(data).toString('base64');
      client.lpush('images', img, function (err, data) {
        fs.unlink(req.files.image.path, function (err) {
          if (err) throw err;
          console.log('Deleted temp file ' + req.files.image.path);
        });
      });
    });
  }
  res.status(204).end();
}]);

app.get('/meow', function(req, res) {
    client.lpop('images', function (err, data) {
      res.writeHead(200, {'content-type':'text/html'});
      res.write("<img src='data:my_pic.jpg;base64,"+data+"'/>");
      res.end();
    });
});

var proxy = httpProxy.createProxyServer();
var proxyServer = http.createServer(function (req, res) {
  client.rpoplpush('hosts', 'hosts', function (err, target){
    if (err) throw err;
    console.log('Redirecting to target server: ' + target);
    target = JSON.parse(target);
    //modify format to form of {target: {host: "foo", port: 1234}} for proxy.web()
    target = {target: target};
    proxy.web(req, res, target);
  });
}).listen(80, function() {
  var host = proxyServer.address();
  console.log('Proxy server listening at http://%s:%s',
    host.address, host.port);
});

var server0 = app.listen(3000, function () {
  var host = server0.address();
  console.log('Example app listening at http://%s:%s',
    host.address, host.port);
});

var server1 = app.listen(3001, function () {
  var host = server1.address();
  console.log('Example app listening at http://%s:%s',
    host.address, host.port);
});


var server2 = app.listen(3002, function () {
  var host = server2.address();
  console.log('Example app listening at http://%s:%s',
    host.address, host.port);
});
