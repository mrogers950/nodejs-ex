//  OpenShift sample Node application
var express = require('express'),
    fs      = require('fs'),
    app     = express(),
    eps     = require('ejs'),
    morgan  = require('morgan'),
    kerberos = require('kerberos');
    
Object.assign=require('object-assign')

app.engine('html', require('ejs').renderFile);
app.use(morgan('combined'))

var port = process.env.PORT || process.env.OPENSHIFT_NODEJS_PORT || 8080,
    ip   = process.env.IP   || process.env.OPENSHIFT_NODEJS_IP || '0.0.0.0',
    mongoURL = process.env.OPENSHIFT_MONGODB_DB_URL || process.env.MONGO_URL,
    mongoURLLabel = "";

if (mongoURL == null && process.env.DATABASE_SERVICE_NAME) {
  var mongoServiceName = process.env.DATABASE_SERVICE_NAME.toUpperCase(),
      mongoHost = process.env[mongoServiceName + '_SERVICE_HOST'],
      mongoPort = process.env[mongoServiceName + '_SERVICE_PORT'],
      mongoDatabase = process.env[mongoServiceName + '_DATABASE'],
      mongoPassword = process.env[mongoServiceName + '_PASSWORD']
      mongoUser = process.env[mongoServiceName + '_USER'];

  if (mongoHost && mongoPort && mongoDatabase) {
    mongoURLLabel = mongoURL = 'mongodb://';
    if (mongoUser && mongoPassword) {
      mongoURL += mongoUser + ':' + mongoPassword + '@';
    }
    // Provide UI label that excludes user id and pw
    mongoURLLabel += mongoHost + ':' + mongoPort + '/' + mongoDatabase;
    mongoURL += mongoHost + ':' +  mongoPort + '/' + mongoDatabase;

  }
}
var db = null,
    dbDetails = new Object();

var initDb = function(callback) {
  if (mongoURL == null) return;

  var mongodb = require('mongodb');
  if (mongodb == null) return;

  mongodb.connect(mongoURL, function(err, conn) {
    if (err) {
      callback(err);
      return;
    }

    db = conn;
    dbDetails.databaseName = db.databaseName;
    dbDetails.url = mongoURLLabel;
    dbDetails.type = 'MongoDB';

    console.log('Connected to MongoDB at: %s', mongoURL);
  });
};

function authenticateWrapper(req, res, next) {
    var auth = req.headers.authorization;  // auth is in base64(username:password)  so we need to decode the base64
    console.log("wrapper: Authorization Header is: ", auth);
    console.log("KRB5_KTNAME: ", process.env['KRB5_KTNAME']);
    if (auth == undefined) {     // No Authorization header was passed in so it's the first time the browser hit us
	// Sending a 401 will require authentication, we need to send the 'WWW-Authenticate' to tell them the sort of authentication to use
	// Basic auth is quite literally the easiest and least secure, it simply gives back  base64( username + ":" + password ) from the browser
	res.setHeader('WWW-Authenticate', 'Negotiate');
	console.log('wrapper: No authorization found, send 401.');
	res.sendStatus(401);
    } else {
	//cut phrase "Negotiate "
	var ticket = req.headers.authorization.substring(10);

	console.log(ticket);
	var kerberosobj = new kerberos.Kerberos();
	console.log(req);

	//init context
	kerberosobj.authGSSServerInit("HTTP", function (err, context) {

	    console.log(err);

	    //check ticket                
	    kerberosobj.authGSSServerStep(context, ticket, function (err) {
		//in success context contains username
		console.log(err);
		res.setHeader('WWW-Authenticate', 'Negotiate ' + context.response);
		res.setHeader('UXTF-userid', context.username);
		next();
	    });
	});


	// var KerberosNative = require('kerberos').Kerberos;
	// var kerberos = new KerberosNative();

	// //init context
	// kerberos.authGSSServerInit("HTTP", function (err, context) {
	//     //check ticket
	//     kerberos.authGSSServerStep(context, ticket, function (err) {
	//         //in success context contains username
	//         res.send(context.username);
	//     });
	// });

    }
}

app.get('/', function (req, res, next) {
  // try to initialize the db on every request if it's not already
  // initialized.
  //
  console.log('Running authenticateWrapper');
  authenticateWrapper(req, res, next);

  if (!db) {
    initDb(function(err){});
  }
  if (db) {
    var col = db.collection('counts');
    // Create a document with request IP and current time of request
    col.insert({ip: req.ip, date: Date.now()});
    col.count(function(err, count){
      res.render('index.html', { pageCountMessage : count, dbInfo: dbDetails });
    });
  } else {
    res.render('index.html', { pageCountMessage : null});
  }
});

app.get('/pagecount', function (req, res) {
  // try to initialize the db on every request if it's not already
  // initialized.
  if (!db) {
    initDb(function(err){});
  }
  if (db) {
    db.collection('counts').count(function(err, count ){
      res.send('{ pageCount: ' + count + '}');
    });
  } else {
    res.send('{ pageCount: -1 }');
  }
});

// error handling
app.use(function(err, req, res, next){
  console.error(err.stack);
  res.status(500).send('Something bad happened!');
});

initDb(function(err){
  console.log('Error connecting to Mongo. Message:\n'+err);
});

app.listen(port, ip);
console.log('Server running on http://%s:%s', ip, port);

module.exports = app ;
